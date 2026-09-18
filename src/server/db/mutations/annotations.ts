import { and, eq, inArray } from "drizzle-orm";
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
import { getAnnotationById } from "../queries";
import { forbidden, notFound } from "../../lib/errors";
import { eventForAnnotation, relatedEventIds } from "../../narrative/jobs";

function jobStatements(raw: D1Database, ids: number[]) {
  return [...new Set(ids)].map((id) => raw.prepare(`INSERT INTO narrative_jobs (event_id) VALUES (?) ON CONFLICT(event_id) DO UPDATE SET requested_version = requested_version + 1, status = 'pending', attempts = 0, next_retry_on = NULL, error_code = NULL, modified_on = CURRENT_TIMESTAMP`).bind(id));
}

async function affectedEvents(db: Db, targetType: AnnotationTargetType, targetId: number) {
  const eventId = await eventForAnnotation(db, targetType, targetId);
  return eventId ? relatedEventIds(db, eventId) : [];
}

export async function createAnnotation(
  db: Db,
  raw: D1Database,
  input: AnnotationCreateInput,
  user: AppUser,
) {
  await assertTargetExists(db, input.targetType, input.targetId);
  const authorId = await resolveUserId(db, user);
  const affected = input.incorporatePref === "separate" ? [] : await affectedEvents(db, input.targetType, input.targetId);
  const batch = await raw.batch([
    raw.prepare(`INSERT INTO annotations (target_type, target_id, body, author_id, annotation_type, incorporate_pref, summary_status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(input.targetType, input.targetId, input.body, authorId, input.annotationType, input.incorporatePref, input.incorporatePref === "separate" ? "excluded" : "pending"),
    raw.prepare(`INSERT INTO object_revisions (target_type, target_id, action, after_json, changed_by) SELECT 'annotation', id, 'create', json_object('id', id, 'body', body, 'targetType', target_type, 'targetId', target_id, 'incorporatePref', incorporate_pref), ? FROM annotations WHERE id = last_insert_rowid()`).bind(authorId),
    ...jobStatements(raw, affected),
  ]);
  const insertedId = Number((batch[0].results[0] as { id: number }).id);

  await setAnnotationPeople(
    db,
    insertedId,
    extractPeopleIds(input.body),
  );
  return getAnnotationById(db, insertedId);
}

export async function updateAnnotation(
  db: Db,
  raw: D1Database,
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

  const body = input.body ?? existing.body;
  const annotationType = input.annotationType ?? existing.annotationType;
  const incorporatePref = input.incorporatePref ?? existing.incorporatePref;
  const changed = body !== existing.body || annotationType !== existing.annotationType || incorporatePref !== existing.incorporatePref;
  if (!changed) return { annotation: await getAnnotationById(db, id), narrativeChanged: false };
  const affectsNarrative = existing.incorporatePref !== "separate" || incorporatePref !== "separate";
  const affected = affectsNarrative ? await affectedEvents(db, existing.targetType, existing.targetId) : [];
  await raw.batch([
    raw.prepare(`UPDATE annotations SET body = ?, annotation_type = ?, incorporate_pref = ?, summary_status = ?, input_revision = input_revision + 1, modified_on = CURRENT_TIMESTAMP WHERE id = ?`).bind(body, annotationType, incorporatePref, incorporatePref === "separate" ? "excluded" : "pending", id),
    raw.prepare(`INSERT INTO object_revisions (target_type, target_id, action, before_json, after_json, changed_by) VALUES ('annotation', ?, 'update', ?, ?, ?)`).bind(id, JSON.stringify(existing), JSON.stringify({ ...existing, body, annotationType, incorporatePref, summaryStatus: incorporatePref === "separate" ? "excluded" : "pending", inputRevision: existing.inputRevision + 1 }), userId),
    ...jobStatements(raw, affected),
  ]);

  if (body !== existing.body) {
    await db
      .delete(annotationPeople)
      .where(eq(annotationPeople.annotationId, id));
    await setAnnotationPeople(db, id, extractPeopleIds(body));
  }

  return { annotation: await getAnnotationById(db, id), narrativeChanged: affectsNarrative };
}

export async function softDeleteAnnotation(
  db: Db,
  raw: D1Database,
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

  const affected = existing.incorporatePref === "separate" ? [] : await affectedEvents(db, existing.targetType, existing.targetId);
  await raw.batch([
    raw.prepare(`UPDATE annotations SET is_deleted = 1, summary_status = 'excluded', input_revision = input_revision + 1, modified_on = CURRENT_TIMESTAMP WHERE id = ?`).bind(id),
    raw.prepare(`INSERT INTO object_revisions (target_type, target_id, action, before_json, changed_by) VALUES ('annotation', ?, 'delete', ?, ?)`).bind(id, JSON.stringify(existing), userId),
    ...jobStatements(raw, affected),
  ]);
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
