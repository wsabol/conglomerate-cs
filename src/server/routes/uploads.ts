import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { events, media } from "../db/schema";
import { uploadCreateSchema } from "@shared/schemas/media";
import { requireUser } from "../middleware/auth";
import { recordRevision } from "../audit/revision";
import { getConfig, mediaTypeForMime } from "../lib/config";
import { ok } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";
import { mediaObjectKey } from "../media/keys";
import { createUploadTarget } from "../media/presign";
import { sha256Hex } from "../media/checksum";
import { finalizeImageVariants, isImageMime } from "../media/process";
import { getMediaItemById } from "../db/queries";

const route = new Hono<AppEnv>();

/** Begin an upload: validate, create a media row, return upload target. */
route.post("/", requireUser, async (c) => {
  const user = c.get("user")!;
  const input = uploadCreateSchema.parse(await c.req.json());
  const config = getConfig(c.env);
  const db = getDb(c.env);

  const event = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, input.eventId), eq(events.isDeleted, false)))
    .get();
  if (!event) throw notFound("Event not found.");

  const category = mediaTypeForMime(c.env, input.mimeType);
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
      createdBy: user.id,
    })
    .returning()
    .get();

  const r2Key = mediaObjectKey(row.id, input.filename);
  await db.update(media).set({ r2Key }).where(eq(media.id, row.id));

  const target = await createUploadTarget(
    c.env,
    r2Key,
    input.mimeType,
    row.id,
  );

  return ok(
    c,
    {
      mediaId: row.id,
      uploadUrl: target.url,
      uploadMethod: target.method,
      directUpload: target.direct,
    },
    "Upload authorized",
    201,
  );
});

/** Dev/local fallback: stream the file body into the R2 binding. */
route.put("/:id/body", requireUser, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid upload id.");
  const db = getDb(c.env);

  const row = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.status, "uploading")))
    .get();
  if (!row || !row.r2Key) throw notFound("Upload not found.");

  const user = c.get("user")!;
  if (row.createdBy !== user.id && user.role !== "editor") {
    throw badRequest("Not your upload.");
  }

  const body = await c.req.arrayBuffer();
  await c.env.MEDIA.put(row.r2Key, body, {
    httpMetadata: {
      contentType: row.mimeType ?? "application/octet-stream",
    },
  });

  return ok(c, { id }, "Upload received");
});

/** Finalize an upload after the object lands in R2. */
route.post("/:id/complete", requireUser, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid upload id.");
  const db = getDb(c.env);
  const user = c.get("user")!;

  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Media not found.");
  if (existing.status === "published") {
    const dto = await getMediaItemById(db, id);
    return ok(c, dto, "Already published");
  }
  if (existing.createdBy !== user.id && user.role !== "editor") {
    throw badRequest("Not your upload.");
  }
  if (!existing.r2Key) throw badRequest("Missing storage key.");

  const object = await c.env.MEDIA.get(existing.r2Key);
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
      c.env.MEDIA,
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

  const dto = await getMediaItemById(db, id);
  return ok(c, dto, "Media published");
});

export default route;
