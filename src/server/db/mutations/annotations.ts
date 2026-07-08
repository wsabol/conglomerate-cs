import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  annotationPeople,
  annotations,
  events,
  media,
  people,
  users,
} from "../schema";
import type {
  AnnotationCreateInput,
  AnnotationUpdateInput,
} from "@shared/schemas/annotation";
import type { AnnotationTargetType } from "@shared/types";
import type { AppUser } from "../../env";
import { extractPeopleIds } from "@shared/mentions";
import { recordRevision } from "../../audit/revision";
import { getAnnotationById } from "../queries";
import { forbidden, notFound } from "../../lib/errors";

export async function createAnnotation(
  db: Db,
  input: AnnotationCreateInput,
  user: AppUser,
) {
  await assertTargetExists(db, input.targetType, input.targetId);
  const authorId = await resolveUserId(db, user);

  const inserted = await db
    .insert(annotations)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      body: input.body,
      authorId,
      annotationType: input.annotationType,
      incorporatePref: input.incorporatePref,
    })
    .returning()
    .get();

  await setAnnotationPeople(
    db,
    inserted.id,
    extractPeopleIds(input.body),
  );
  await recordRevision(db, {
    targetType: "annotation",
    targetId: inserted.id,
    action: "create",
    after: inserted,
    changedBy: authorId,
  });

  return getAnnotationById(db, inserted.id);
}

export async function updateAnnotation(
  db: Db,
  id: number,
  input: AnnotationUpdateInput,
  user: AppUser,
) {
  const existing = await db
    .select()
    .from(annotations)
    .where(and(eq(annotations.id, id), eq(annotations.isDeleted, false)))
    .get();
  if (!existing) return null;

  const userId = await resolveUserId(db, user);
  if (user.role !== "editor" && existing.authorId !== userId) {
    throw forbidden("You can only edit your own memories.");
  }

  await db
    .update(annotations)
    .set({
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.annotationType !== undefined
        ? { annotationType: input.annotationType }
        : {}),
      ...(input.incorporatePref !== undefined
        ? { incorporatePref: input.incorporatePref }
        : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(annotations.id, id));

  if (input.body !== undefined) {
    await db
      .delete(annotationPeople)
      .where(eq(annotationPeople.annotationId, id));
    await setAnnotationPeople(db, id, extractPeopleIds(input.body));
  }

  await recordRevision(db, {
    targetType: "annotation",
    targetId: id,
    action: "update",
    before: existing,
    after: { ...existing, ...input },
    changedBy: userId,
  });

  return getAnnotationById(db, id);
}

export async function softDeleteAnnotation(
  db: Db,
  id: number,
  user: AppUser,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(annotations)
    .where(and(eq(annotations.id, id), eq(annotations.isDeleted, false)))
    .get();
  if (!existing) return false;

  const userId = await resolveUserId(db, user);
  if (user.role !== "editor" && existing.authorId !== userId) {
    throw forbidden("You can only delete your own memories.");
  }

  await db
    .update(annotations)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(annotations.id, id));

  await recordRevision(db, {
    targetType: "annotation",
    targetId: id,
    action: "delete",
    before: existing,
    changedBy: userId,
  });
  return true;
}

async function assertTargetExists(
  db: Db,
  targetType: AnnotationTargetType,
  targetId: number,
) {
  if (targetType === "event") {
    const row = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, targetId), eq(events.isDeleted, false)))
      .get();
    if (!row) throw notFound("Event not found.");
  } else {
    const row = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, targetId), eq(media.isDeleted, false)))
      .get();
    if (!row) throw notFound("Media not found.");
  }
}

async function setAnnotationPeople(
  db: Db,
  annotationId: number,
  peopleIds: number[],
) {
  if (!peopleIds || peopleIds.length === 0) return;
  const valid = await db
    .select({ id: people.id })
    .from(people)
    .where(and(inArray(people.id, peopleIds), eq(people.isDeleted, false)));
  if (valid.length === 0) return;
  await db
    .insert(annotationPeople)
    .values(valid.map((p) => ({ annotationId, personId: p.id })));
}

/** Resolve a real users.id for the acting identity (dev override has id 0). */
async function resolveUserId(db: Db, user: AppUser): Promise<number> {
  if (user.id > 0) return user.id;
  const email = user.email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (existing) return existing.id;
  const created = await db
    .insert(users)
    .values({ email, role: user.role })
    .returning()
    .get();
  return created.id;
}
