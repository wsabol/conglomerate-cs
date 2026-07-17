import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { events, media } from "../schema";
import type { UploadCreateInput } from "@shared/schemas/media";
import type { AppUser, Env } from "../../env";
import { recordRevision } from "../../audit/revision";
import { getConfig, mediaTypeForMime } from "../../lib/config";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { mediaObjectKey } from "../../media/keys";
import { createUploadTarget } from "../../media/presign";
import { sha256Hex, sha256HexFromStream } from "../../media/checksum";
import { finalizeImageVariants, isImageMime } from "../../media/process";
import { sniffVideoCodec, sniffVideoCodecFromR2 } from "../../media/codec";
import { claimAndIngestVideo, transitionVideoToUploaded } from "../../media/ingest";
import { findPublishedMediaByChecksum, getMediaItemById } from "../queries";

type DuplicateMedia = NonNullable<
  Awaited<ReturnType<typeof findPublishedMediaByChecksum>>
>;

function duplicateConflict(existing: DuplicateMedia) {
  return conflict("This file already exists in the archive.", [
    {
      message: existing.eventTitle
        ? `Already uploaded for ${existing.eventTitle}`
        : `Already uploaded as media #${existing.id}`,
      error_code: "duplicate_media",
    },
  ]);
}

/** Delete R2 objects for a rejected upload and mark the row failed. */
async function abortDuplicateUpload(
  env: Env,
  db: Db,
  row: typeof media.$inferSelect,
): Promise<void> {
  const keys = new Set<string>();
  if (row.r2Key) keys.add(row.r2Key);
  if (row.displayKey) keys.add(row.displayKey);
  if (row.thumbKey) keys.add(row.thumbKey);
  // Variants may have been written before publish failed.
  keys.add(mediaObjectKey(row.id, "image", "display"));
  keys.add(mediaObjectKey(row.id, "image", "thumb"));

  for (const key of keys) {
    try {
      await env.MEDIA.delete(key);
    } catch {
      // Best-effort cleanup; do not block the conflict response.
    }
  }

  await db
    .update(media)
    .set({ status: "failed", modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(media.id, row.id));
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message =
    "message" in err && typeof err.message === "string" ? err.message : "";
  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("media_checksum_published_uidx")
  );
}

export async function beginUpload(
  env: Env,
  db: Db,
  input: UploadCreateInput,
  userId: number,
) {
  const config = getConfig(env);

  const event = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, input.eventId), eq(events.isDeleted, false)))
    .get();
  if (!event) throw notFound("Event not found.");

  if (input.checksum) {
    const existing = await findPublishedMediaByChecksum(db, input.checksum);
    if (existing) throw duplicateConflict(existing);
  }

  const category = mediaTypeForMime(env, input.mimeType);
  if (!category) {
    throw badRequest(`Unsupported file type: ${input.mimeType}`);
  }

  const limit = config.uploadLimits[category];
  if (input.size > limit) {
    throw badRequest(`File exceeds the ${category} size limit.`);
  }

  const row = await db
    .insert(media)
    .values({
      eventId: input.eventId,
      title: input.title ?? input.filename,
      mediaType: category,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      status: "uploading",
      processingProvider: category === "video" ? "stream" : null,
      createdBy: userId,
    })
    .returning()
    .get();

  const r2Key = mediaObjectKey(row.id, input.filename);
  await db.update(media).set({ r2Key }).where(eq(media.id, row.id));

  const target = await createUploadTarget(env, r2Key, input.mimeType, row.id);

  return {
    mediaId: row.id,
    uploadUrl: target.url,
    uploadMethod: target.method,
    directUpload: target.direct,
  };
}

export async function receiveUploadBody(
  env: Env,
  db: Db,
  id: number,
  user: AppUser,
  body: ArrayBuffer,
) {
  const row = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.status, "uploading")))
    .get();
  if (!row || !row.r2Key) throw notFound("Upload not found.");

  if (row.createdBy !== user.id && user.role !== "editor") {
    throw badRequest("Not your upload.");
  }

  await env.MEDIA.put(row.r2Key, body, {
    httpMetadata: {
      contentType: row.mimeType ?? "application/octet-stream",
    },
  });

  return { id };
}

/** Defer Stream ingest when completing very large uploads in-request. */
const LARGE_VIDEO_COMPLETE_BYTES = 200 * 1024 * 1024;

export async function completeUpload(
  env: Env,
  db: Db,
  id: number,
  user: AppUser,
  options?: { executionCtx?: Pick<ExecutionContext, "waitUntil"> },
) {
  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Media not found.");
  if (existing.status === "published") {
    return getMediaItemById(db, id, env.MEDIA);
  }
  if (
    existing.mediaType === "video" &&
    (existing.status === "processing" ||
      existing.status === "uploaded" ||
      existing.streamUid)
  ) {
    return getMediaItemById(db, id, env.MEDIA);
  }
  if (existing.createdBy !== user.id && user.role !== "editor") {
    throw badRequest("Not your upload.");
  }
  if (!existing.r2Key) throw badRequest("Missing storage key.");

  const object = await env.MEDIA.get(existing.r2Key);
  if (!object) {
    await db
      .update(media)
      .set({ status: "failed", modifiedOn: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(media.id, id));
    throw badRequest("Upload not found in storage.");
  }

  const size = object.size;
  const isVideo = existing.mediaType === "video";

  let checksum: string;
  let displayKey: string | null = null;
  let thumbKey: string | null = null;
  let videoCodec: string | null = null;

  if (isVideo) {
    checksum = await sha256HexFromStream(object.body);
    videoCodec = await sniffVideoCodecFromR2(env.MEDIA, existing.r2Key, size);
  } else if (existing.mimeType && isImageMime(existing.mimeType)) {
    const buffer = await object.arrayBuffer();
    checksum = await sha256Hex(buffer);
    const variants = await finalizeImageVariants(
      env.MEDIA,
      id,
      existing.r2Key,
      existing.mimeType,
    );
    displayKey = variants.displayKey;
    thumbKey = variants.thumbKey;
  } else {
    checksum = await sha256HexFromStream(object.body);
  }

  const duplicate = await findPublishedMediaByChecksum(db, checksum);
  if (duplicate && duplicate.id !== id) {
    await abortDuplicateUpload(env, db, existing);
    throw duplicateConflict(duplicate);
  }

  if (isVideo) {
    let uploaded = await transitionVideoToUploaded(db, id, {
      size,
      checksum,
      videoCodec,
    });
    if (!uploaded) {
      const fallback = await db
        .select()
        .from(media)
        .where(eq(media.id, id))
        .get();
      if (!fallback) throw notFound("Media not found.");
      uploaded = fallback;
    }

    const afterIngest = await claimAndIngestVideo(
      env,
      db,
      uploaded,
      user.id,
      {
        executionCtx: options?.executionCtx,
        deferIngestOverBytes: LARGE_VIDEO_COMPLETE_BYTES,
      },
    );

    await recordRevision(db, {
      targetType: "media",
      targetId: id,
      action: "create",
      after: afterIngest,
      changedBy: user.id,
    });

    return getMediaItemById(db, id, env.MEDIA);
  }

  let updated: typeof media.$inferSelect;
  try {
    updated = await db
      .update(media)
      .set({
        status: "published",
        size,
        checksum,
        displayKey,
        thumbKey,
        videoCodec,
        modifiedOn: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(media.id, id))
      .returning()
      .get();
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const raced = await findPublishedMediaByChecksum(db, checksum);
      await abortDuplicateUpload(env, db, {
        ...existing,
        displayKey,
        thumbKey,
      });
      if (raced) throw duplicateConflict(raced);
      throw conflict("This file already exists in the archive.", [
        {
          message: "Already uploaded as a duplicate.",
          error_code: "duplicate_media",
        },
      ]);
    }
    throw err;
  }

  await recordRevision(db, {
    targetType: "media",
    targetId: id,
    action: "create",
    after: updated,
    changedBy: user.id,
  });

  if (existing.eventId && updated.mediaType === "photo") {
    const event = await db
      .select()
      .from(events)
      .where(and(eq(events.id, existing.eventId), eq(events.isDeleted, false)))
      .get();

    if (event && event.heroImageId == null) {
      const patched = await db
        .update(events)
        .set({
          heroImageId: id,
          modifiedOn: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(
          and(
            eq(events.id, event.id),
            eq(events.isDeleted, false),
            isNull(events.heroImageId),
          ),
        )
        .returning()
        .get();

      if (patched) {
        await recordRevision(db, {
          targetType: "event",
          targetId: event.id,
          action: "update",
          before: event,
          after: patched,
          changedBy: user.id,
        });
      }
    }
  }

  return getMediaItemById(db, id, env.MEDIA);
}
