import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { annotations, eventActs, eventPeople, events, media, narrativeJobs } from "../db/schema";

/** Only exact dates support a relative-day claim. */
export async function relatedEventIds(db: Db, eventId: number): Promise<number[]> {
  const source = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.isDeleted, false))).get();
  if (!source) return [];
  const ids = new Set([eventId]);
  if (source.datePrecision !== "exact" || !source.eventDate) return [...ids];
  const people = await db.select({ id: eventPeople.personId }).from(eventPeople).where(and(eq(eventPeople.eventId, eventId), eq(eventPeople.isDeleted, false)));
  const acts = await db.select({ name: eventActs.name }).from(eventActs).where(eq(eventActs.eventId, eventId));
  const date = new Date(`${source.eventDate}T00:00:00Z`);
  const lower = new Date(date); lower.setUTCDate(lower.getUTCDate() - 3);
  const upper = new Date(date); upper.setUTCDate(upper.getUTCDate() + 3);
  const nearby = await db.select({ id: events.id, placeId: events.placeId }).from(events).where(and(
    eq(events.isDeleted, false), eq(events.datePrecision, "exact"),
    gte(events.eventDate, lower.toISOString().slice(0, 10)),
    lte(events.eventDate, upper.toISOString().slice(0, 10)),
  ));
  if (!nearby.length) return [...ids];
  const candidateIds = nearby.map((e) => e.id);
  const [sharedPeople, sharedActs] = await Promise.all([
    people.length ? db.select({ eventId: eventPeople.eventId }).from(eventPeople).where(and(inArray(eventPeople.eventId, candidateIds), inArray(eventPeople.personId, people.map((p) => p.id)), eq(eventPeople.isDeleted, false))) : [],
    acts.length ? db.select({ eventId: eventActs.eventId }).from(eventActs).where(and(inArray(eventActs.eventId, candidateIds), inArray(eventActs.name, acts.map((a) => a.name)))) : [],
  ]);
  for (const row of [...sharedPeople, ...sharedActs]) ids.add(row.eventId);
  if (source.placeId) for (const row of nearby) if (row.placeId === source.placeId) ids.add(row.id);
  return [...ids];
}

export async function eventForAnnotation(db: Db, targetType: "event" | "media", targetId: number): Promise<number | null> {
  if (targetType === "event") return targetId;
  const row = await db.select({ eventId: media.eventId }).from(media).where(and(eq(media.id, targetId), eq(media.isDeleted, false))).get();
  return row?.eventId ?? null;
}

export async function invalidateNarratives(db: Db, ids: number[]) {
  for (const id of new Set(ids)) {
    await db.insert(narrativeJobs).values({ eventId: id }).onConflictDoUpdate({
      target: narrativeJobs.eventId,
      set: { requestedVersion: sql`${narrativeJobs.requestedVersion} + 1`, status: "pending", attempts: 0, nextRetryOn: null, errorCode: null, modifiedOn: sql`CURRENT_TIMESTAMP` },
    });
  }
}

export async function invalidateAround(db: Db, eventId: number | null) {
  if (eventId) await invalidateNarratives(db, await relatedEventIds(db, eventId));
}

export async function invalidateForPlace(db: Db, placeId: number) {
  const rows = await db.select({ id: events.id }).from(events).where(and(eq(events.placeId, placeId), eq(events.isDeleted, false)));
  const related = await Promise.all(rows.map((row) => relatedEventIds(db, row.id)));
  await invalidateNarratives(db, related.flat());
}

export async function invalidateForPerson(db: Db, personId: number) {
  const rows = await db.select({ id: eventPeople.eventId }).from(eventPeople).where(and(eq(eventPeople.personId, personId), eq(eventPeople.isDeleted, false)));
  const related = await Promise.all(rows.map((row) => relatedEventIds(db, row.id)));
  await invalidateNarratives(db, related.flat());
}

export async function markAnnotations(db: Db, eventId: number, status: "processing" | "incorporated" | "failed") {
  const linked = await db.select({ id: media.id }).from(media).where(and(eq(media.eventId, eventId), eq(media.isDeleted, false)));
  await db.update(annotations).set({ summaryStatus: status, ...(status === "incorporated" ? { processedRevision: sql`${annotations.inputRevision}` } : {}) }).where(and(
    eq(annotations.isDeleted, false),
    status === "processing" ? or(eq(annotations.summaryStatus, "pending"), eq(annotations.summaryStatus, "failed")) : eq(annotations.summaryStatus, "processing"),
    or(and(eq(annotations.targetType, "event"), eq(annotations.targetId, eventId)), linked.length ? and(eq(annotations.targetType, "media"), inArray(annotations.targetId, linked.map((m) => m.id))) : sql`0`),
    sql`${annotations.incorporatePref} <> 'separate'`,
  ));
}
