import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../client";
import { annotations, eventActs, eventPeople, eventPerformanceDetails, eventSources, events, narrativeJobs, people } from "../schema";
import type { EventCreateInput, EventUpdateInput } from "@shared/schemas/event";
import type { EventType } from "@shared/types";
import { assessEventConfidence } from "@shared/confidence";
import { eventSlug } from "../../lib/slug";
import { badRequest } from "../../lib/errors";
import { recordRevision } from "../../audit/revision";
import { getEventDetail, getEventConfidenceContext, getEligibleConfidenceMedia, eventRowSnapshot, rowJson } from "../queries";
import { commitConfidenceBatch, type MutationStatement } from "./confidence";
import { invalidateNarratives, relatedEventIds } from "../../narrative/jobs";
import { draftEvidence } from "../../narrative/draft";
import { conflict } from "../../lib/errors";

function isPerformance(type: EventType): boolean { return type === "performance"; }

function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameUnordered(a: unknown[], b: unknown[]): boolean {
  return sameValues(a.map((v) => JSON.stringify(v)).sort(), b.map((v) => JSON.stringify(v)).sort());
}

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
  const eligibleMediaIds = await getEligibleConfidenceMedia(db, input.sources);
  const assessment = assessEventConfidence({ ...input, eligibleMediaIds });
  // Resolve the generated ID inside the same batch, without relying on last_insert_rowid
  // after relation or revision inserts have changed it.
  const eventId = sql<number>`(SELECT id FROM events WHERE slug = ${slug})`;
  await commitConfidenceBatch(db, [
    db.insert(events).values({ slug, name: input.name, eventType: input.eventType,
      eventDate: input.eventDate ?? null, eventTime: input.eventTime ?? null,
      datePrecision: input.datePrecision, placeId: input.placeId ?? null,
      summary: input.summary ?? null,
      confidence: assessment.level, heroImageId: input.heroImageId ?? null }),
    ...relationStatements(db, eventId, input, changedBy),
    recordRevision(db, { targetType: "event", targetId: eventId, action: "create", after: eventRowSnapshot(eventId), changedBy }),
  ]);
  const inserted = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).get();
  // A new event has no memories to incorporate. Its facts can still affect
  // existing related narratives, but it needs no narrative job of its own.
  if (inserted) await invalidateNarratives(db,
    (await relatedEventIds(db, inserted.id)).filter((id) => id !== inserted.id));
  return getEventDetail(db, slug);
}

export async function updateEventBySlug(db: Db, slug: string, input: EventUpdateInput, changedBy: number) {
  const row = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).get();
  if (!row) return null;
  const context = await getEventConfidenceContext(db, row.id);
  if (!context || context.event.isDeleted) return null;
  const existing = context.event;
  const oldNeighbors = await relatedEventIds(db, existing.id);
  const nextEventType = input.eventType ?? existing.eventType;
  if (isPerformance(nextEventType) !== isPerformance(existing.eventType)) {
    throw badRequest("Events cannot be changed between performance and non-performance types.");
  }
  validateTypeSpecificInput(nextEventType, input);
  // Omitted fields retain their values; explicit null and [] clear them.
  const { performance, sources, people: peopleInput, acts, summaryDraftBasis, ...fields } = input;
  const draftAccepted = !!summaryDraftBasis && !!input.summary?.trim();
  // Read the queue version before validating evidence. Any later invalidation
  // must survive acceptance of this older draft, even if a worker finishes it.
  const draftJob = draftAccepted ? await db.select().from(narrativeJobs)
    .where(eq(narrativeJobs.eventId, existing.id)).get() : undefined;
  const validatedDraft = summaryDraftBasis ? await draftEvidence(db, existing.id) : undefined;
  if (summaryDraftBasis) {
    if (!draftAccepted) throw badRequest("A generated draft must have a nonempty summary.");
    if (validatedDraft?.basis !== summaryDraftBasis)
      throw conflict("Event evidence changed since this draft was generated. Generate a fresh summary before saving.");
  }
  const scalarFields = {
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  };
  const beforeChange: Record<string, unknown> = {};
  const afterChange: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(scalarFields)) {
    const oldValue = existing[key as keyof typeof existing];
    if ((value ?? null) !== (oldValue ?? null)) {
      beforeChange[key] = oldValue;
      afterChange[key] = value;
    }
  }
  const performanceChanges = Object.fromEntries(Object.entries(performance ?? {}).filter(([, value]) => value !== undefined));
  for (const [key, value] of Object.entries(performanceChanges)) {
    const oldValue = context.performance?.[key as keyof NonNullable<typeof context.performance>] ?? null;
    if ((value ?? null) !== oldValue) {
      beforeChange[`performance.${key}`] = oldValue;
      afterChange[`performance.${key}`] = value;
    }
  }
  const normalizeSources = (rows: typeof context.sources) => rows.map((s) => ({
    sourceType: s.sourceType, description: s.description ?? null, url: s.url || null, mediaId: s.mediaId ?? null,
  }));
  if (sources !== undefined) {
    const oldSources = normalizeSources(context.sources);
    const newSources = normalizeSources(sources as typeof context.sources);
    if (!sameUnordered(oldSources, newSources)) {
      beforeChange.sources = oldSources;
      afterChange.sources = newSources;
    }
  }
  if (peopleInput !== undefined) {
    const oldPeople = await db.select({ personId: eventPeople.personId, relationshipType: eventPeople.relationshipType, notes: eventPeople.notes })
      .from(eventPeople).where(and(eq(eventPeople.eventId, existing.id), eq(eventPeople.isDeleted, false)));
    const newPeople = peopleInput.map((p) => ({ personId: p.personId ?? null, relationshipType: p.relationshipType, notes: p.notes ?? null,
      ...(p.personId == null && p.displayName ? { displayName: p.displayName } : {}) }));
    if (!sameUnordered(oldPeople, newPeople)) {
      beforeChange.people = oldPeople;
      afterChange.people = newPeople;
    }
  }
  if (acts !== undefined) {
    const oldActs = await db.select({ name: eventActs.name, billingRole: eventActs.billingRole })
      .from(eventActs).where(eq(eventActs.eventId, existing.id));
    const newActs = acts.map((a) => ({ name: a.name, billingRole: a.billingRole }));
    if (!sameUnordered(oldActs, newActs)) {
      beforeChange.acts = oldActs;
      afterChange.acts = newActs;
    }
  }
  if (!Object.keys(afterChange).length && !draftAccepted) return getEventDetail(db, existing.slug);
  const next = { ...existing, ...scalarFields };
  const nextSources = sources ?? context.sources;
  const nextPerformance = { ...context.performance,
    ...Object.fromEntries(Object.entries(performance ?? {}).filter(([, value]) => value !== undefined)) };
  const eligibleMediaIds = await getEligibleConfidenceMedia(db, nextSources);
  const assessment = assessEventConfidence({ ...next, sources: nextSources,
    performance: nextPerformance, eligibleMediaIds });
  if (assessment.level !== existing.confidence) {
    beforeChange.confidence = existing.confidence;
    afterChange.confidence = assessment.level;
  }
  const newSlug = input.name !== undefined || input.eventDate !== undefined
    ? await uniqueEventSlug(db, next.name, next.eventDate, existing.id) : existing.slug;
  const narrativeChanged = Object.keys(afterChange).some((key) =>
    ["name", "eventType", "eventDate", "eventTime", "datePrecision", "placeId",
      "people", "acts", "performance.promotionText"].includes(key)
  );
  const draftMemories = validatedDraft?.context.find((item) => item.role === "focal")?.memories ?? [];
  const draftVersionUnchanged = sql`${narrativeJobs.requestedVersion} = ${draftJob?.requestedVersion ?? 0}`;
  await commitConfidenceBatch(db, [
    db.update(events).set(Object.keys(afterChange).length
      ? { ...scalarFields, slug: newSlug, confidence: assessment.level, modifiedOn: sql`(CURRENT_TIMESTAMP)` }
      : { summary: existing.summary }).where(eq(events.id, existing.id)),
    ...(draftAccepted ? [db.insert(narrativeJobs).values({ eventId: existing.id, status: "complete", completedVersion: 1,
      hasGeneratedSummary: true, sourceSnapshot: JSON.stringify(draftMemories) }).onConflictDoUpdate({
      target: narrativeJobs.eventId,
      set: { requestedVersion: sql`${narrativeJobs.requestedVersion} + 1`,
        completedVersion: sql`CASE WHEN ${draftVersionUnchanged} THEN ${narrativeJobs.requestedVersion} + 1 ELSE ${narrativeJobs.completedVersion} END`,
        status: sql`CASE WHEN ${draftVersionUnchanged} THEN 'complete' ELSE 'pending' END`,
        hasGeneratedSummary: true, sourceSnapshot: JSON.stringify(draftMemories),
        leaseToken: null, leaseUntil: null, attempts: 0, nextRetryOn: null, errorCode: null,
        modifiedOn: sql`CURRENT_TIMESTAMP` },
    })] : []),
    ...(narrativeChanged && !draftAccepted ? [db.insert(narrativeJobs).values({ eventId: existing.id }).onConflictDoUpdate({
      target: narrativeJobs.eventId,
      set: { requestedVersion: sql`${narrativeJobs.requestedVersion} + 1`, status: "pending", attempts: 0, nextRetryOn: null, errorCode: null, modifiedOn: sql`CURRENT_TIMESTAMP` },
    })] : []),
    ...draftMemories.map((memory) => db.update(annotations)
      .set({ summaryStatus: "incorporated", processedRevision: memory.revision })
      .where(and(eq(annotations.id, memory.id), eq(annotations.inputRevision, memory.revision),
        eq(annotations.isDeleted, false), ne(annotations.incorporatePref, "separate")))),
    ...relationStatements(db, existing.id, {
      performance: Object.keys(performanceChanges).some((key) => `performance.${key}` in afterChange) ? performance : undefined,
      sources: "sources" in afterChange ? sources : undefined,
      people: "people" in afterChange ? peopleInput : undefined,
      acts: "acts" in afterChange ? acts : undefined,
    }, changedBy),
    ...(Object.keys(afterChange).length ? [recordRevision(db, { targetType: "event", targetId: existing.id, action: "update",
      before: beforeChange, after: afterChange, changedBy }),
    ] : []),
  ]);
  if (narrativeChanged) await invalidateNarratives(db, [...oldNeighbors, ...await relatedEventIds(db, existing.id)].filter((id) => id !== existing.id));
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
