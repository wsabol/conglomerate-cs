import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  eventActs,
  eventPeople,
  eventPerformanceDetails,
  eventSources,
  events,
} from "../schema";
import type { EventCreateInput, EventUpdateInput } from "@shared/schemas/event";
import { eventSlug } from "../../lib/slug";
import { recordRevision } from "../../audit/revision";
import { getEventDetail } from "../queries";

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

export async function createEvent(
  db: Db,
  input: EventCreateInput,
  changedBy: number,
) {
  const slug = await uniqueEventSlug(db, input.name, input.eventDate);

  const inserted = await db
    .insert(events)
    .values({
      slug,
      name: input.name,
      eventType: input.eventType,
      eventDate: input.eventDate ?? null,
      eventTime: input.eventTime ?? null,
      datePrecision: input.datePrecision,
      placeId: input.placeId ?? null,
      summary: input.summary ?? null,
      confidence: input.confidence,
      heroImageId: input.heroImageId ?? null,
    })
    .returning()
    .get();

  await syncEventRelations(db, inserted.id, input);
  await recordRevision(db, {
    targetType: "event",
    targetId: inserted.id,
    action: "create",
    after: inserted,
    changedBy,
  });

  return getEventDetail(db, slug);
}

export async function updateEventBySlug(
  db: Db,
  slug: string,
  input: EventUpdateInput,
  changedBy: number,
) {
  const existing = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.isDeleted, false)))
    .get();
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const eventDate =
    input.eventDate !== undefined ? input.eventDate : existing.eventDate;
  const newSlug =
    input.name !== undefined || input.eventDate !== undefined
      ? await uniqueEventSlug(db, name, eventDate, existing.id)
      : existing.slug;

  await db
    .update(events)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
      ...(input.eventDate !== undefined ? { eventDate: input.eventDate } : {}),
      ...(input.eventTime !== undefined ? { eventTime: input.eventTime } : {}),
      ...(input.datePrecision !== undefined
        ? { datePrecision: input.datePrecision }
        : {}),
      ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.heroImageId !== undefined
        ? { heroImageId: input.heroImageId }
        : {}),
      slug: newSlug,
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(events.id, existing.id));

  const updated = await db
    .select()
    .from(events)
    .where(eq(events.id, existing.id))
    .get();

  if (
    input.performance !== undefined ||
    input.people !== undefined ||
    input.acts !== undefined ||
    input.sources !== undefined
  ) {
    await syncEventRelations(db, existing.id, {
      performance: input.performance,
      people: input.people,
      acts: input.acts,
      sources: input.sources,
    });
  }

  await recordRevision(db, {
    targetType: "event",
    targetId: existing.id,
    action: "update",
    before: existing,
    after: updated,
    changedBy,
  });

  return getEventDetail(db, newSlug);
}

export async function softDeleteEvent(
  db: Db,
  slug: string,
  changedBy: number,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.isDeleted, false)))
    .get();
  if (!existing) return false;

  await db
    .update(events)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(events.id, existing.id));

  await recordRevision(db, {
    targetType: "event",
    targetId: existing.id,
    action: "delete",
    before: existing,
    changedBy,
  });
  return true;
}

async function syncEventRelations(
  db: Db,
  eventId: number,
  input: Partial<EventCreateInput>,
) {
  if (input.performance !== undefined) {
    const perf = input.performance;
    if (perf) {
      const existingPerf = await db
        .select()
        .from(eventPerformanceDetails)
        .where(eq(eventPerformanceDetails.eventId, eventId))
        .get();

      const merged = {
        billingName:
          perf.billingName !== undefined
            ? (perf.billingName ?? null)
            : (existingPerf?.billingName ?? null),
        promotionText:
          perf.promotionText !== undefined
            ? (perf.promotionText ?? null)
            : (existingPerf?.promotionText ?? null),
        setlistText:
          perf.setlistText !== undefined
            ? (perf.setlistText ?? null)
            : (existingPerf?.setlistText ?? null),
        eventPosterId:
          perf.eventPosterId !== undefined
            ? (perf.eventPosterId ?? null)
            : (existingPerf?.eventPosterId ?? null),
      };

      await db
        .insert(eventPerformanceDetails)
        .values({
          eventId,
          ...merged,
        })
        .onConflictDoUpdate({
          target: eventPerformanceDetails.eventId,
          set: merged,
        });
    }
  }

  if (input.people !== undefined) {
    await db.delete(eventPeople).where(eq(eventPeople.eventId, eventId));
    if (input.people.length > 0) {
      await db.insert(eventPeople).values(
        input.people.map((p) => ({
          eventId,
          personId: p.personId,
          relationshipType: p.relationshipType,
          notes: p.notes ?? null,
        })),
      );
    }
  }

  if (input.acts !== undefined) {
    await db.delete(eventActs).where(eq(eventActs.eventId, eventId));
    if (input.acts.length > 0) {
      await db.insert(eventActs).values(
        input.acts.map((a) => ({
          eventId,
          name: a.name,
          billingRole: a.billingRole,
        })),
      );
    }
  }

  if (input.sources !== undefined) {
    const sources = input.sources;
    await db.delete(eventSources).where(eq(eventSources.eventId, eventId));
    if (sources.length > 0) {
      await db.insert(eventSources).values(
        sources.map((s) => ({
          eventId,
          sourceType: s.sourceType,
          description: s.description ?? null,
          url: s.url || null,
          mediaId: s.mediaId ?? null,
        })),
      );
    }
  }
}

export async function updateEventById(
  db: Db,
  id: number,
  input: EventUpdateInput,
  changedBy: number,
) {
  const row = await db
    .select({ slug: events.slug })
    .from(events)
    .where(and(eq(events.id, id), eq(events.isDeleted, false)))
    .get();
  if (!row) return null;
  return updateEventBySlug(db, row.slug, input, changedBy);
}
