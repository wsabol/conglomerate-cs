import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import type { Env } from "../env";
import type { AppUser } from "../env";
import { badRequest } from "../lib/errors";
import { claimAndIngestVideo } from "./ingest";
import { requireMediaMutationAccess } from "./access";
import { createStreamVideoService } from "./stream";
import { logProcessing } from "./logging";

export async function retryVideoProcessing(
  env: Env,
  db: Db,
  id: number,
  user: AppUser,
  options?: { force?: boolean },
) {
  const row = await requireMediaMutationAccess(db, id, user);

  if (row.mediaType !== "video") {
    throw badRequest("Only videos can be retried.");
  }

  if (
    row.status !== "failed" &&
    row.status !== "uploaded" &&
    !(options?.force && row.status === "processing" && !row.streamUid)
  ) {
    throw badRequest("This media item cannot be retried.");
  }

  if (!row.r2Key) {
    throw badRequest("Original file is missing.");
  }

  const object = await env.MEDIA.get(row.r2Key);
  if (!object) {
    throw badRequest("Original file is missing from storage.");
  }

  if (row.streamUid) {
    const stream = createStreamVideoService(env);
    try {
      await stream.deleteVideo(row.streamUid);
    } catch {
      // Best-effort cleanup before retry.
    }
    await db
      .update(media)
      .set({
        streamUid: null,
        streamState: null,
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, id));
  }

  if (row.status !== "uploaded") {
    await db
      .update(media)
      .set({
        status: "uploaded",
        processingErrorCode: null,
        processingErrorMessage: null,
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, id));
  } else {
    await db
      .update(media)
      .set({
        processingErrorCode: null,
        processingErrorMessage: null,
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, id));
  }

  const refreshed = await db
    .select()
    .from(media)
    .where(eq(media.id, id))
    .get();

  if (!refreshed) throw badRequest("Media not found.");

  logProcessing({
    mediaId: id,
    operation: "retry_processing",
    statusBefore: row.status,
    processingAttempt: refreshed.processingAttempts,
  });

  return claimAndIngestVideo(env, db, refreshed, user.id, {
    force: options?.force ?? true,
  });
}

export async function deleteStreamAndR2Assets(
  env: Env,
  row: typeof media.$inferSelect,
): Promise<void> {
  if (row.streamUid) {
    const stream = createStreamVideoService(env);
    try {
      await stream.deleteVideo(row.streamUid);
      logProcessing({
        mediaId: row.id,
        streamUid: row.streamUid,
        operation: "stream_delete",
      });
    } catch {
      logProcessing({
        mediaId: row.id,
        streamUid: row.streamUid,
        operation: "stream_delete_failed",
        errorCode: "STREAM_ASSET_MISSING",
      });
    }
  }

  const keys = new Set<string>();
  if (row.r2Key) keys.add(row.r2Key);
  if (row.displayKey) keys.add(row.displayKey);
  if (row.thumbKey) keys.add(row.thumbKey);

  for (const key of keys) {
    try {
      await env.MEDIA.delete(key);
    } catch {
      logProcessing({
        mediaId: row.id,
        r2Key: key,
        operation: "r2_delete_failed",
        errorCode: "ORIGINAL_ASSET_MISSING",
      });
    }
  }
}
