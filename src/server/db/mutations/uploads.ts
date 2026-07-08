import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { events, media } from "../schema";
import type { UploadCreateInput } from "@shared/schemas/media";
import type { AppUser, Env } from "../../env";
import { recordRevision } from "../../audit/revision";
import { getConfig, mediaTypeForMime } from "../../lib/config";
import { badRequest, notFound } from "../../lib/errors";
import { mediaObjectKey } from "../../media/keys";
import { createUploadTarget } from "../../media/presign";
import { sha256Hex } from "../../media/checksum";
import { finalizeImageVariants, isImageMime } from "../../media/process";
import { getMediaItemById } from "../queries";

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

export async function completeUpload(
  env: Env,
  db: Db,
  id: number,
  user: AppUser,
) {
  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Media not found.");
  if (existing.status === "published") {
    return getMediaItemById(db, id);
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

  const buffer = await object.arrayBuffer();
  const checksum = await sha256Hex(buffer);
  const size = object.size;

  let displayKey: string | null = null;
  let thumbKey: string | null = null;
  if (existing.mimeType && isImageMime(existing.mimeType)) {
    const variants = await finalizeImageVariants(
      env.MEDIA,
      id,
      existing.r2Key,
      existing.mimeType,
    );
    displayKey = variants.displayKey;
    thumbKey = variants.thumbKey;
  }

  const updated = await db
    .update(media)
    .set({
      status: "published",
      size,
      checksum,
      displayKey,
      thumbKey,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(media.id, id))
    .returning()
    .get();

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

  return getMediaItemById(db, id);
}
