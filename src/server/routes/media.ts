import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { events, media, mediaPeople, people } from "../db/schema";
import { listMedia, getMediaItemById } from "../db/queries";
import { mediaQuerySchema } from "@shared/schemas/query";
import { mediaUpdateSchema } from "@shared/schemas/media";
import { requireUser } from "../middleware/auth";
import { recordRevision } from "../audit/revision";
import { ok, okList } from "../lib/response";
import { badRequest, forbidden, notFound } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const query = mediaQuerySchema.parse(c.req.query());
  const results = await listMedia(getDb(c.env), query);
  return okList(c, results, "Returned media");
});

route.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const item = await getMediaItemById(getDb(c.env), id);
  if (!item) throw notFound("Media not found.");
  return ok(c, item, "Returned media");
});

route.patch("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const input = mediaUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Media not found.");

  const isOwner = existing.createdBy === user.id;
  const isEditor = user.role === "editor";
  if (!isOwner && !isEditor) throw forbidden("Not allowed to edit this media.");

  if (input.eventId !== undefined && input.eventId !== null) {
    const ev = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, input.eventId), eq(events.isDeleted, false)))
      .get();
    if (!ev) throw badRequest("Event not found.");
  }

  await db
    .update(media)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      ...(input.capturedDate !== undefined
        ? { capturedDate: input.capturedDate }
        : {}),
      ...(input.datePrecision !== undefined
        ? { datePrecision: input.datePrecision }
        : {}),
      ...(input.provenance !== undefined
        ? { provenance: input.provenance }
        : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(media.id, id));

  if (input.peopleIds !== undefined) {
    await db.delete(mediaPeople).where(eq(mediaPeople.mediaId, id));
    if (input.peopleIds.length > 0) {
      const valid = await db
        .select({ id: people.id })
        .from(people)
        .where(
          and(inArray(people.id, input.peopleIds), eq(people.isDeleted, false)),
        );
      if (valid.length > 0) {
        await db
          .insert(mediaPeople)
          .values(valid.map((p) => ({ mediaId: id, personId: p.id })));
      }
    }
  }

  const updated = await db
    .select()
    .from(media)
    .where(eq(media.id, id))
    .get();

  await recordRevision(db, {
    targetType: "media",
    targetId: id,
    action: "update",
    before: existing,
    after: updated,
    changedBy: user.id,
  });

  const dto = await getMediaItemById(db, id);
  return ok(c, dto, "Media updated");
});

route.delete("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const db = getDb(c.env);

  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Media not found.");

  const isOwner = existing.createdBy === user.id;
  const isEditor = user.role === "editor";
  if (!isOwner && !isEditor) throw forbidden("Not allowed to delete this media.");

  await db
    .update(media)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(media.id, id));

  await recordRevision(db, {
    targetType: "media",
    targetId: id,
    action: "delete",
    before: existing,
    changedBy: user.id,
  });

  return ok(c, { id }, "Media deleted");
});

export default route;
