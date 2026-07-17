import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import type { Env } from "../env";
import { claimAndIngestVideo } from "./ingest";
import { logProcessing } from "./logging";

export interface StreamBackfillOptions {
  dryRun?: boolean;
  mediaId?: number;
  limit?: number;
  retryFailed?: boolean;
}

export interface StreamBackfillResult {
  examined: number;
  started: number;
  skipped: number;
  dryRun: boolean;
  mediaIds: number[];
}

export async function runStreamBackfill(
  env: Env,
  db: Db,
  options: StreamBackfillOptions = {},
): Promise<StreamBackfillResult> {
  const limit = options.limit ?? 10;
  const conds = [
    eq(media.mediaType, "video"),
    eq(media.isDeleted, false),
    isNull(media.streamUid),
  ];

  if (options.mediaId) {
    conds.push(eq(media.id, options.mediaId));
  } else if (options.retryFailed) {
    conds.push(
      sql`${media.status} IN ('published', 'failed', 'uploaded', 'processing')`,
    );
  } else {
    conds.push(
      sql`${media.status} IN ('published', 'failed', 'uploaded')`,
    );
  }

  const rows = await db
    .select()
    .from(media)
    .where(and(...conds))
    .orderBy(media.id)
    .limit(limit);

  const result: StreamBackfillResult = {
    examined: rows.length,
    started: 0,
    skipped: 0,
    dryRun: options.dryRun ?? false,
    mediaIds: [],
  };

  for (const row of rows) {
    if (!row.r2Key) {
      result.skipped++;
      continue;
    }

    const object = await env.MEDIA.get(row.r2Key);
    if (!object) {
      result.skipped++;
      logProcessing({
        mediaId: row.id,
        r2Key: row.r2Key,
        operation: "backfill_missing_original",
        errorCode: "ORIGINAL_ASSET_MISSING",
      });
      continue;
    }

    if (options.dryRun) {
      result.started++;
      result.mediaIds.push(row.id);
      continue;
    }

    if (row.processingProvider !== "stream") {
      await db
        .update(media)
        .set({
          processingProvider: "stream",
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(media.id, row.id));
    }

    if (row.status !== "uploaded" && row.status !== "failed") {
      await db
        .update(media)
        .set({
          status: "uploaded",
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(media.id, row.id));
    }

    const refreshed = await db
      .select()
      .from(media)
      .where(eq(media.id, row.id))
      .get();

    if (!refreshed?.createdBy) {
      result.skipped++;
      continue;
    }

    await claimAndIngestVideo(env, db, refreshed, refreshed.createdBy, {
      force: options.retryFailed ?? false,
    });

    result.started++;
    result.mediaIds.push(row.id);
    logProcessing({
      mediaId: row.id,
      operation: "backfill_started",
      statusBefore: row.status,
      statusAfter: "processing",
    });
  }

  return result;
}
