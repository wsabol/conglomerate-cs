import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import type { Env } from "../env";
import { getConfig } from "../lib/config";
import { claimAndIngestVideo } from "./ingest";
import { logProcessing } from "./logging";
import { createStreamVideoService } from "./stream";
import {
  mapStreamErrorCode,
  PROCESSING_FAILURE_MESSAGE,
  type VerifiedStreamWebhook,
} from "./webhook";

function nowIso(): string {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function isTerminalError(state: string, errorCode: string | null): boolean {
  if (errorCode) return true;
  return state === "error" || state === "failed";
}

export async function applyStreamWebhookEvent(
  db: Db,
  event: VerifiedStreamWebhook,
): Promise<boolean> {
  const row = await db
    .select()
    .from(media)
    .where(and(eq(media.streamUid, event.uid), eq(media.isDeleted, false)))
    .get();
  if (!row) return false;

  const statusBefore = row.status;

  if (event.readyToStream || event.state === "ready") {
    if (row.status === "published") {
      await db
        .update(media)
        .set({
          streamState: "ready",
          streamLastCheckedOn: nowIso(),
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(media.id, row.id));
      return true;
    }

    await db
      .update(media)
      .set({
        status: "published",
        streamState: "ready",
        processedOn: nowIso(),
        processingErrorCode: null,
        processingErrorMessage: null,
        streamLastCheckedOn: nowIso(),
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, row.id));

    logProcessing({
      mediaId: row.id,
      streamUid: event.uid,
      operation: "webhook_published",
      statusBefore,
      statusAfter: "published",
    });
    return true;
  }

  if (isTerminalError(event.state, event.errorReasonCode)) {
    if (row.status === "failed") return true;

    const errorCode = mapStreamErrorCode(event.errorReasonCode);
    await db
      .update(media)
      .set({
        status: "failed",
        streamState: event.state,
        processingErrorCode: errorCode,
        processingErrorMessage: PROCESSING_FAILURE_MESSAGE,
        streamLastCheckedOn: nowIso(),
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, row.id));

    logProcessing({
      mediaId: row.id,
      streamUid: event.uid,
      operation: "webhook_failed",
      statusBefore,
      statusAfter: "failed",
      errorCode,
    });
    return true;
  }

  await db
    .update(media)
    .set({
      streamState: event.state,
      streamLastCheckedOn: nowIso(),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(media.id, row.id));

  return true;
}

async function reconcileProcessingRow(
  env: Env,
  db: Db,
  row: typeof media.$inferSelect,
  timeoutHours: number,
): Promise<void> {
  if (!row.streamUid) return;

  const stream = createStreamVideoService(env);
  const started = Date.now();
  const statusBefore = row.status;

  try {
    const video = await stream.getVideo(row.streamUid);
    const checkedOn = nowIso();

    if (video.readyToStream || video.state === "ready") {
      await db
        .update(media)
        .set({
          status: "published",
          streamState: "ready",
          processedOn: checkedOn,
          processingErrorCode: null,
          processingErrorMessage: null,
          streamLastCheckedOn: checkedOn,
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(media.id, row.id));
      logProcessing({
        mediaId: row.id,
        streamUid: row.streamUid,
        operation: "reconcile_published",
        statusBefore,
        statusAfter: "published",
        durationMs: Date.now() - started,
      });
      return;
    }

    if (isTerminalError(video.state ?? "", null)) {
      await db
        .update(media)
        .set({
          status: "failed",
          streamState: video.state,
          processingErrorCode: "STREAM_PROCESSING_FAILED",
          processingErrorMessage: PROCESSING_FAILURE_MESSAGE,
          streamLastCheckedOn: checkedOn,
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(media.id, row.id));
      logProcessing({
        mediaId: row.id,
        streamUid: row.streamUid,
        operation: "reconcile_failed",
        statusBefore,
        statusAfter: "failed",
        durationMs: Date.now() - started,
        errorCode: "STREAM_PROCESSING_FAILED",
      });
      return;
    }

    const timedOut =
      row.processingStartedOn != null &&
      row.processingStartedOn < hoursAgoIso(timeoutHours);

    if (timedOut) {
      await db
        .update(media)
        .set({
          status: "failed",
          streamState: video.state,
          processingErrorCode: "STREAM_PROCESSING_FAILED",
          processingErrorMessage: PROCESSING_FAILURE_MESSAGE,
          streamLastCheckedOn: checkedOn,
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(media.id, row.id));
      logProcessing({
        mediaId: row.id,
        streamUid: row.streamUid,
        operation: "reconcile_timeout",
        statusBefore,
        statusAfter: "failed",
        durationMs: Date.now() - started,
        errorCode: "STREAM_PROCESSING_FAILED",
      });
      return;
    }

    await db
      .update(media)
      .set({
        streamState: video.state,
        streamLastCheckedOn: checkedOn,
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, row.id));
  } catch {
    await db
      .update(media)
      .set({
        streamLastCheckedOn: nowIso(),
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, row.id));
    logProcessing({
      mediaId: row.id,
      streamUid: row.streamUid,
      operation: "reconcile_check_failed",
      statusBefore,
      errorCode: "STREAM_ASSET_MISSING",
      durationMs: Date.now() - started,
    });
  }
}

export async function reconcileStreamProcessing(env: Env, db: Db): Promise<void> {
  const config = getConfig(env);
  const startedBefore = minutesAgoIso(10);
  const checkedBefore = minutesAgoIso(15);

  const processingRows = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.status, "processing"),
        eq(media.isDeleted, false),
        lt(media.processingStartedOn, startedBefore),
        or(
          isNull(media.streamLastCheckedOn),
          lt(media.streamLastCheckedOn, checkedBefore),
        ),
      ),
    );

  for (const row of processingRows) {
    await reconcileProcessingRow(
      env,
      db,
      row,
      config.streamProcessingTimeoutHours,
    );
  }

  const uploadedRows = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.status, "uploaded"),
        eq(media.mediaType, "video"),
        isNull(media.streamUid),
        eq(media.isDeleted, false),
      ),
    );

  for (const row of uploadedRows) {
    if (!row.createdBy) continue;
    await claimAndIngestVideo(env, db, row, row.createdBy);
  }
}
