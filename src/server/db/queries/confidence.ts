import { and, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../client";
import { events, eventPerformanceDetails, eventSources, media, type EventRow, type EventSourceRow, type EventPerformanceDetailsRow } from "../schema";
import { assessEventConfidence, type ConfidenceInput } from "@shared/confidence";

/** SQL JSON uses the same camelCase field names as Drizzle's row objects. */
export function rowJson(table: SQLiteTable): SQL<string> {
  return sql<string>`json_object(${sql.join(Object.entries(getTableColumns(table))
    .flatMap(([name, column]) => [sql`${name}`, sql`${column}`]), sql`, `)})`;
}

export function eventRowSnapshot(id: number | SQL): SQL<string> {
  return sql<string>`(SELECT ${rowJson(events)} FROM ${events} WHERE ${events.id} = ${id})`;
}

export function eventConfidenceSnapshot(id: number | SQL): SQL<string> {
  return sql<string>`json_object(
    'event', json(${eventRowSnapshot(id)}),
    'performance', json((SELECT ${rowJson(eventPerformanceDetails)} FROM ${eventPerformanceDetails} WHERE ${eventPerformanceDetails.eventId} = ${id})),
    'sources', json((SELECT json_group_array(json(source)) FROM
      (SELECT ${rowJson(eventSources)} AS source FROM ${eventSources} WHERE ${eventSources.eventId} = ${id} ORDER BY ${eventSources.id}))),
    'eligibleMediaIds', json((SELECT json_group_array(id) FROM (SELECT ${media.id} AS id FROM ${media} WHERE ${media.status} = 'published' AND ${media.isDeleted} = 0 AND ${media.id} IN
      (SELECT ${eventSources.mediaId} FROM ${eventSources} WHERE ${eventSources.eventId} = ${id} AND ${eventSources.sourceType} = 'media') ORDER BY ${media.id})))
  )`;
}

export interface EventConfidenceContext {
  event: EventRow;
  performance: EventPerformanceDetailsRow | null;
  sources: EventSourceRow[];
  eligibleMediaIds: number[];
}

export async function getEventConfidenceContext(db: Db, id: number) {
  const row = await db.select({ snapshot: eventConfidenceSnapshot(id) }).from(sql`(SELECT 1)`).get();
  const context = JSON.parse(row!.snapshot) as EventConfidenceContext | { event: null };
  if (!context.event) return null;
  const value = context as EventConfidenceContext;
  value.event.isDeleted = Boolean(value.event.isDeleted);
  return value;
}

export function assessConfidenceContext(context: EventConfidenceContext) {
  return assessEventConfidence({
    ...context.event,
    performance: context.performance,
    sources: context.sources,
    eligibleMediaIds: context.eligibleMediaIds,
  });
}

export async function getEligibleConfidenceMedia(db: Db, sources: ConfidenceInput["sources"]) {
  const ids = [...new Set(sources.filter((s) => s.sourceType === "media" && s.mediaId != null).map((s) => s.mediaId!))];
  // A single JSON parameter keeps large source sets below D1's bind limit.
  const row = await db.select({ snapshot: sql<string>`(SELECT json_group_array(id) FROM (SELECT ${media.id} AS id FROM ${media}
    WHERE ${media.status} = 'published' AND ${media.isDeleted} = 0
    AND ${media.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)})) ORDER BY ${media.id}))` }).from(sql`(SELECT 1)`).get();
  return JSON.parse(row!.snapshot) as number[];
}

export async function getEventsCitingMedia(db: Db, mediaId: number) {
  return db.select({ id: events.id }).from(events).where(and(
    eq(events.isDeleted, false),
    inArray(events.id, db.select({ id: eventSources.eventId }).from(eventSources)
      .where(and(eq(eventSources.sourceType, "media"), eq(eventSources.mediaId, mediaId)))),
  ));
}

export async function listConfidenceBackfillIds(db: Db, afterId: number, limit: number) {
  return db.select({ id: events.id }).from(events)
    .where(and(eq(events.isDeleted, false), sql`${events.id} > ${afterId}`))
    .orderBy(events.id).limit(limit);
}

export function mediaRowSnapshot(id: number | SQL): SQL<string> {
  return sql<string>`(SELECT ${rowJson(media)} FROM ${media} WHERE ${media.id} = ${id})`;
}

export async function getEventsUsingMediaRole(db: Db, id: number) {
  return db.select().from(events).where(sql`${events.heroImageId} = ${id} OR ${events.id} IN
    (SELECT ${eventPerformanceDetails.eventId} FROM ${eventPerformanceDetails} WHERE ${eventPerformanceDetails.eventPosterId} = ${id})`);
}
