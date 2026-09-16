import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../client";
import { eventActs, eventPeople, eventPerformanceDetails, eventSources, events, people } from "../schema";
import type { EventCreateInput, EventUpdateInput } from "@shared/schemas/event";
import type { EventType } from "@shared/types";
import { assessEventConfidence } from "@shared/confidence";
import { eventSlug } from "../../lib/slug";
import { badRequest } from "../../lib/errors";
import { recordRevision } from "../../audit/revision";
import { getEventDetail, getEventConfidenceContext, getEligibleConfidenceMedia, eventRowSnapshot, rowJson } from "../queries";
import { commitConfidenceBatch, confidenceSnapshotGuard, type MutationStatement } from "./confidence";

function isPerformance(type: EventType): boolean { return type === "performance"; }

function validateTypeSpecificInput(eventType: EventType, input: Partial<Pick<EventCreateInput, "performance" | "acts">>) {
  if (isPerformance(eventType)) return;
  if (input.performance !== undefined) throw badRequest("Performance details are only allowed for performances.");
  if (input.acts && input.acts.length > 0) throw badRequest("Billed acts are only allowed for performances.");
}
/** Generate a unique slug, appending `-2`, `-3`, … on collision. */
export async function uniqueEventSlug(
  db: Db,
  name: string,
  dateISO: string | null | undefined,
  excludeId?: number,
): Promise<string> {
  let base = eventSlug(name, dateISO);
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(
        excludeId
          ? and(eq(events.slug, candidate), ne(events.id, excludeId))
          : eq(events.slug, candidate),
      )
      .get();
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
}


/** Build statements without executing, including inline person creation. */
function relationStatements(db: Db, eventId: number | SQL, input: Partial<EventCreateInput>, changedBy: number): MutationStatement[] {
  const statements: MutationStatement[] = [];
  if (input.performance !== undefined) {
    const fields = Object.fromEntries(Object.entries(input.performance).filter(([, value]) => value !== undefined));
    if (Object.keys(fields).length) statements.push(db.insert(eventPerformanceDetails)
      .values({ eventId, ...fields }).onConflictDoUpdate({ target: eventPerformanceDetails.eventId, set: fields }));
  }
  if (input.people !== undefined) {
    statements.push(db.delete(eventPeople).where(eq(eventPeople.eventId, eventId)));
    const created = new Map<string, SQL<number>>();
    for (const person of input.people) {
      const link = {
        eventId,
        relationshipType: person.relationshipType,
        notes: person.notes ?? null,
      };
      if (person.personId != null) {
        statements.push(db.insert(eventPeople).values({ ...link, personId: person.personId }));
        continue;
      }
      const name = person.displayName!.trim();
      const key = name.toLowerCase();
      const reusedId = created.get(key);
      if (reusedId) {
        statements.push(db.insert(eventPeople).values({ ...link, personId: reusedId }));
        continue;
      }
      // last_insert_rowid() must be read in the immediately following statement.
      statements.push(db.insert(people).values({ displayName: name }));
      statements.push(db.insert(eventPeople).values({ ...link, personId: sql<number>`last_insert_rowid()` }));
      const insertedId = sql<number>`(SELECT ${eventPeople.personId} FROM ${eventPeople} WHERE ${eventPeople.id} = last_insert_rowid())`;
      created.set(key, sql<number>`(SELECT ${eventPeople.personId} FROM ${eventPeople}
        INNER JOIN ${people} ON ${people.id} = ${eventPeople.personId}
        WHERE ${eventPeople.eventId} = ${eventId} AND ${people.displayName} = ${name}
        ORDER BY ${eventPeople.id} ASC LIMIT 1)`);
      statements.push(recordRevision(db, { targetType: "people", targetId: insertedId, action: "create", changedBy,
        after: sql`(SELECT ${rowJson(people)} FROM ${people} WHERE ${people.id} = ${insertedId})` }));
    }
  }
  if (input.acts !== undefined) {
    statements.push(db.delete(eventActs).where(eq(eventActs.eventId, eventId)));
    for (const act of input.acts) statements.push(db.insert(eventActs).values({ eventId, ...act }));
  }
  if (input.sources !== undefined) {
    statements.push(db.delete(eventSources).where(eq(eventSources.eventId, eventId)));
    for (const source of input.sources) statements.push(db.insert(eventSources).values({
      eventId, sourceType: source.sourceType, description: source.description ?? null,
      url: source.url || null, mediaId: source.mediaId ?? null,
    }));
  }
  return statements;
}

export async function createEvent(db: Db, input: EventCreateInput, changedBy: number) {
  validateTypeSpecificInput(input.eventType, input);
  const slug = await uniqueEventSlug(db, input.name, input.eventDate);
  const eligible = await getEligibleConfidenceMedia(db, input.sources);
  const assessment = assessEventConfidence({ ...input, eligibleMediaIds: eligible.ids });
  // Resolve the generated ID inside the same batch, without relying on last_insert_rowid
  // after relation or revision inserts have changed it.
  const eventId = sql<number>`(SELECT id FROM events WHERE slug = ${slug})`;
  await commitConfidenceBatch(db, [
    confidenceSnapshotGuard(db, eligible.expression, eligible.snapshot),
    db.insert(events).values({ slug, name: input.name, eventType: input.eventType,
      eventDate: input.eventDate ?? null, eventTime: input.eventTime ?? null,
      datePrecision: input.datePrecision, placeId: input.placeId ?? null,
      summary: input.summary ?? null, confidence: assessment.level, heroImageId: input.heroImageId ?? null }),
    ...relationStatements(db, eventId, input, changedBy),
    recordRevision(db, { targetType: "event", targetId: eventId, action: "create", after: eventRowSnapshot(eventId), changedBy }),
  ]);
  return getEventDetail(db, slug);
}

export async function updateEventBySlug(db: Db, slug: string, input: EventUpdateInput, changedBy: number) {
  const row = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).get();
  if (!row) return null;
  const context = await getEventConfidenceContext(db, row.id);
  if (!context || context.event.isDeleted) return null;
  const existing = context.event;
  const nextEventType = input.eventType ?? existing.eventType;
  if (isPerformance(nextEventType) !== isPerformance(existing.eventType)) {
    throw badRequest("Events cannot be changed between performance and non-performance types.");
  }
  validateTypeSpecificInput(nextEventType, input);
  // Omitted fields retain their values; explicit null and [] clear them.
  const { performance, sources, people: peopleInput, acts, ...fields } = input;
  const scalarFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  const next = { ...existing, ...scalarFields };
  const nextSources = sources ?? context.sources;
  const nextPerformance = { ...context.performance,
    ...Object.fromEntries(Object.entries(performance ?? {}).filter(([, value]) => value !== undefined)) };
  const eligible = await getEligibleConfidenceMedia(db, nextSources);
  const assessment = assessEventConfidence({ ...next, sources: nextSources,
    performance: nextPerformance, eligibleMediaIds: eligible.ids });
  const newSlug = input.name !== undefined || input.eventDate !== undefined
    ? await uniqueEventSlug(db, next.name, next.eventDate, existing.id) : existing.slug;
  await commitConfidenceBatch(db, [
    confidenceSnapshotGuard(db, context.expression, context.snapshot),
    confidenceSnapshotGuard(db, eligible.expression, eligible.snapshot),
    db.update(events).set({ ...scalarFields, slug: newSlug, confidence: assessment.level,
      modifiedOn: sql`(CURRENT_TIMESTAMP)` }).where(eq(events.id, existing.id)),
    ...relationStatements(db, existing.id, { performance, sources, people: peopleInput, acts }, changedBy),
    recordRevision(db, { targetType: "event", targetId: existing.id, action: "update",
      before: existing, after: eventRowSnapshot(existing.id), changedBy }),
  ]);
  return getEventDetail(db, newSlug);
}

export async function softDeleteEvent(db: Db, slug: string, changedBy: number): Promise<boolean> {
  const existing = await db.select().from(events)
    .where(and(eq(events.slug, slug), eq(events.isDeleted, false))).get();
  if (!existing) return false;
  await db.batch([
    db.update(events).set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` }).where(eq(events.id, existing.id)),
    recordRevision(db, { targetType: "event", targetId: existing.id, action: "delete", before: existing, changedBy }),
  ]);
  return true;
}

export async function updateEventById(db: Db, id: number, input: EventUpdateInput, changedBy: number) {
  const row = await db.select({ slug: events.slug }).from(events)
    .where(and(eq(events.id, id), eq(events.isDeleted, false))).get();
  if (!row) return null;
  return updateEventBySlug(db, row.slug, input, changedBy);
}
