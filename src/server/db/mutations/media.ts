import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  eventPerformanceDetails,
  events,
  media,
  mediaPeople,
  people,
} from "../schema";
import type { MediaUpdateInput } from "@shared/schemas/media";
import type { AppUser } from "../../env";
import { recordRevision } from "../../audit/revision";
import { getMediaItemById } from "../queries";
import { badRequest, forbidden } from "../../lib/errors";
import type { Env } from "../../env";
import { deleteStreamAndR2Assets } from "../../media/retry";

export async function updateMedia(
  db: Db,
  id: number,
  input: MediaUpdateInput,
  user: AppUser,
) {
  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) return null;

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

  return getMediaItemById(db, id);
}

export async function softDeleteMedia(
  db: Db,
  id: number,
  user: AppUser,
  env?: Env,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!existing) return false;

  const isOwner = existing.createdBy === user.id;
  const isEditor = user.role === "editor";
  if (!isOwner && !isEditor) throw forbidden("Not allowed to delete this media.");

  if (env) {
    await deleteStreamAndR2Assets(env, existing);
  }

  // Clear role FKs that still point at this media so soft-deleted rows
  // do not keep driving hero/poster display.
  await db
    .update(events)
    .set({
      heroImageId: null,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(events.heroImageId, id));

  await db
    .update(eventPerformanceDetails)
    .set({ eventPosterId: null })
    .where(eq(eventPerformanceDetails.eventPosterId, id));

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
  return true;
}
