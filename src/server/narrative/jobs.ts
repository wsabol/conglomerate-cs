import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { getNearbyNarrativeEvents } from "../db/queries";
import { annotations, eventPeople, events, media, narrativeJobs } from "../db/schema";
import type { NarrativeJobDTO } from "@shared/dto";

type JobStatusRow = Pick<typeof narrativeJobs.$inferSelect,
  "status" | "requestedVersion" | "completedVersion" | "errorCode" | "leaseUntil">;

export function publicNarrativeJob(job: JobStatusRow | null | undefined, now = Date.now()): NarrativeJobDTO | null {
  if (!job) return null;
  const leaseExpired = job.status === "processing" && job.leaseUntil !== null
    && Date.parse(job.leaseUntil) <= now;
  return {
    status: leaseExpired ? "failed" : job.status,
    requestedVersion: job.requestedVersion,
    completedVersion: job.completedVersion,
    errorCode: leaseExpired ? "LEASE_EXPIRED" : job.errorCode,
  };
}

/** Recover work expired by the previous queue-age policy, including staged backfills. */
export async function recoverExpiredNarratives(db: Db): Promise<void> {
  await db.update(narrativeJobs).set({ status: "pending", errorCode: null, nextRetryOn: null,
    leaseToken: null, leaseUntil: null, modifiedOn: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(narrativeJobs.status, "failed"), eq(narrativeJobs.errorCode, "QUEUE_EXPIRED")));
}

/** The source itself and narratives that can include it as nearby evidence. */
export async function relatedEventIds(db: Db, eventId: number): Promise<number[]> {
  const source = await db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), eq(events.isDeleted, false))).get();
  if (!source) return [];
  const dependents = await getNearbyNarrativeEvents(db, eventId, "dependents");
  return [eventId, ...dependents.map((event) => event.id)];
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
