import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import type { Env } from "../env";
import { getConfig } from "../lib/config";
import { logProcessing } from "./logging";
import { streamIngestErrorMessage } from "./ingestUrl";
import { createStreamVideoService } from "./stream";

type MediaRow = typeof media.$inferSelect;

export interface ClaimAndIngestResult {
  claimed: boolean;
  row: MediaRow;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function claimVideoForIngest(
  db: Db,
  mediaId: number,
): Promise<MediaRow | null> {
  const startedOn = nowIso();
  const claimed = await db
    .update(media)
    .set({
      status: "processing",
      processingStartedOn: startedOn,
      processingAttempts: sql`${media.processingAttempts} + 1`,
      processingErrorCode: null,
      processingErrorMessage: null,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(
      and(
        eq(media.id, mediaId),
        isNull(media.streamUid),
        or(eq(media.status, "uploaded"), eq(media.status, "failed")),
      ),
    )
    .returning()
    .get();

  return claimed ?? null;
}

export async function saveStreamIngestResult(
  db: Db,
  mediaId: number,
  streamUid: string,
  streamState: string | null,
): Promise<MediaRow> {
  return db
    .update(media)
    .set({
      streamUid,
      streamState,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(media.id, mediaId))
    .returning()
    .get();
}

export async function markIngestFailed(
  db: Db,
  mediaId: number,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(media)
    .set({
      status: "failed",
      processingErrorCode: errorCode,
      processingErrorMessage: errorMessage,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(media.id, mediaId));
}

export async function claimAndIngestVideo(
  env: Env,
  db: Db,
  row: MediaRow,
  creatorId: number,
  options?: { force?: boolean },
): Promise<MediaRow> {
  const config = getConfig(env);
  const started = Date.now();

  if (row.streamUid) return row;
  if (row.status === "published") return row;
  if (row.status === "processing" && row.processingStartedOn) return row;

  if (
    !options?.force &&
    row.processingAttempts >= config.streamProcessingMaxAttempts
  ) {
    await markIngestFailed(
      db,
      row.id,
      "STREAM_INGEST_FAILED",
      "Maximum automatic processing attempts reached.",
    );
    const failed = await db
      .select()
      .from(media)
      .where(eq(media.id, row.id))
      .get();
    return failed!;
  }

  if (row.status !== "uploaded" && row.status !== "failed") {
    return row;
  }

  const claimed = await claimVideoForIngest(db, row.id);
  if (!claimed) {
    const current = await db
      .select()
      .from(media)
      .where(eq(media.id, row.id))
      .get();
    return current ?? row;
  }

  const stream = createStreamVideoService(env);

  try {
    const result = await stream.ingestFromR2({
      mediaId: row.id,
      r2Key: row.r2Key!,
      filename: row.originalFilename ?? `media-${row.id}`,
      creatorId,
    });

    try {
      const updated = await saveStreamIngestResult(
        db,
        row.id,
        result.uid,
        result.state,
      );
      logProcessing({
        mediaId: row.id,
        streamUid: result.uid,
        r2Key: row.r2Key,
        operation: "stream_ingest",
        processingAttempt: updated.processingAttempts,
        statusBefore: row.status,
        statusAfter: "processing",
        durationMs: Date.now() - started,
      });
      return updated;
    } catch (dbErr) {
      logProcessing({
        mediaId: row.id,
        streamUid: result.uid,
        r2Key: row.r2Key,
        operation: "stream_ingest_orphan",
        processingAttempt: claimed.processingAttempts,
        statusBefore: row.status,
        statusAfter: "processing",
        durationMs: Date.now() - started,
        errorCode: "STREAM_INGEST_FAILED",
      });
      console.error("Orphaned Stream UID after D1 update failure", {
        mediaId: row.id,
        streamUid: result.uid,
        error: dbErr instanceof Error ? dbErr.message : "unknown",
      });
      throw dbErr;
    }
  } catch (err) {
    const detail = streamIngestErrorMessage(err);
    await markIngestFailed(
      db,
      row.id,
      "STREAM_INGEST_FAILED",
      "Video ingestion failed. The original file is still safely stored.",
    );
    logProcessing({
      mediaId: row.id,
      r2Key: row.r2Key,
      operation: "stream_ingest_failed",
      processingAttempt: claimed.processingAttempts,
      statusBefore: row.status,
      statusAfter: "failed",
      durationMs: Date.now() - started,
      errorCode: "STREAM_INGEST_FAILED",
    });
    console.error("Stream ingest failed", {
      mediaId: row.id,
      error: detail,
    });
    const failed = await db
      .select()
      .from(media)
      .where(eq(media.id, row.id))
      .get();
    return failed ?? claimed;
  }
}

export async function transitionVideoToUploaded(
  db: Db,
  id: number,
  fields: {
    size: number;
    checksum: string;
    videoCodec: string | null;
  },
): Promise<MediaRow> {
  return db
    .update(media)
    .set({
      status: "uploaded",
      size: fields.size,
      checksum: fields.checksum,
      videoCodec: fields.videoCodec,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(and(eq(media.id, id), eq(media.status, "uploading")))
    .returning()
    .get();
}
