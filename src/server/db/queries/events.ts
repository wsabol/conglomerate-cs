import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  eventActs,
  eventPeople,
  eventPerformanceDetails,
  eventSources,
  events,
  media,
  people,
  places,
} from "../schema";
import type { EventsQuery } from "@shared/schemas/query";
import type {
  EventDetailDTO,
  EventListItemDTO,
  MediaAvailabilityDTO,
  PlaceDTO,
} from "@shared/dto";
import {
  HEADLINER_ACT_NAMES,
  type BillingRole,
} from "@shared/types";
import { mediaDeliveryUrl } from "../../media/url";
import { getAnnotations } from "./annotations";
import { emptyAvailability, toPlaceDTO } from "./helpers";
import { listMediaForEvent } from "./media";

function isEventHeadlined(
  acts: { name: string; billingRole: BillingRole }[],
): boolean {
  return acts.some(
    (act) =>
      act.billingRole === "headliner" &&
      HEADLINER_ACT_NAMES.some(
        (name) => name.toLowerCase() === act.name.toLowerCase(),
      ),
  );
}

function headlinerActNameCondition() {
  return or(
    ...HEADLINER_ACT_NAMES.map(
      (name) => sql`lower(${eventActs.name}) = ${name.toLowerCase()}`,
    ),
  );
}

async function headlinedEventIds(
  db: Db,
  eventIds: number[],
): Promise<Set<number>> {
  const ids = new Set<number>();
  if (eventIds.length === 0) return ids;

  const rows = await db
    .select({ eventId: eventActs.eventId, name: eventActs.name })
    .from(eventActs)
    .where(
      and(
        inArray(eventActs.eventId, eventIds),
        eq(eventActs.billingRole, "headliner"),
      ),
    );

  for (const row of rows) {
    if (
      HEADLINER_ACT_NAMES.some(
        (name) => name.toLowerCase() === row.name.toLowerCase(),
      )
    ) {
      ids.add(row.eventId);
    }
  }
  return ids;
}

function lineupActConditions(lineup: BillingRole) {
  const conds = [eq(eventActs.billingRole, lineup)];
  if (lineup === "headliner") {
    const nameMatch = headlinerActNameCondition();
    if (nameMatch) conds.push(nameMatch);
  }
  return and(...conds);
}

async function mediaAvailability(
  db: Db,
  eventIds: number[],
): Promise<Map<number, MediaAvailabilityDTO>> {
  const map = new Map<number, MediaAvailabilityDTO>();
  if (eventIds.length === 0) return map;

  const rows = await db
    .select({ eventId: media.eventId, mediaType: media.mediaType })
    .from(media)
    .where(
      and(
        inArray(media.eventId, eventIds),
        eq(media.status, "published"),
        eq(media.isDeleted, false),
      ),
    );

  for (const row of rows) {
    if (row.eventId == null) continue;
    const avail = map.get(row.eventId) ?? emptyAvailability();
    if (row.mediaType === "photo") avail.photo = true;
    if (row.mediaType === "video") avail.video = true;
    if (row.mediaType === "audio") avail.audio = true;
    map.set(row.eventId, avail);
  }
  return map;
}

export async function listEvents(
  db: Db,
  q: EventsQuery,
): Promise<EventListItemDTO[]> {
  const conds = [eq(events.isDeleted, false)];
  if (q.event_type) conds.push(eq(events.eventType, q.event_type));
  if (q.place) conds.push(eq(events.placeId, q.place));
  if (q.year) conds.push(like(events.eventDate, `${q.year}-%`));
  if (q.q) {
    const term = `%${q.q}%`;
    const match = or(like(events.name, term), like(events.summary, term));
    if (match) conds.push(match);
  }
  if (q.person) {
    conds.push(
      inArray(
        events.id,
        db
          .select({ id: eventPeople.eventId })
          .from(eventPeople)
          .where(
            and(
              eq(eventPeople.personId, q.person),
              eq(eventPeople.isDeleted, false),
            ),
          ),
      ),
    );
  }
  if (q.lineup) {
    conds.push(
      inArray(
        events.id,
        db
          .select({ id: eventActs.eventId })
          .from(eventActs)
          .where(lineupActConditions(q.lineup)),
      ),
    );
  }

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      eventType: events.eventType,
      eventDate: events.eventDate,
      eventTime: events.eventTime,
      datePrecision: events.datePrecision,
      confidence: events.confidence,
      heroImageId: events.heroImageId,
      placeId: places.id,
      placeName: places.name,
      billingName: eventPerformanceDetails.billingName,
      setlistText: eventPerformanceDetails.setlistText,
    })
    .from(events)
    .leftJoin(places, eq(places.id, events.placeId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, events.id),
    )
    .where(and(...conds))
    .orderBy(q.sort === "date" ? desc(events.eventDate) : desc(events.modifiedOn));

  const availability = await mediaAvailability(
    db,
    rows.map((row) => row.id),
  );
  const headlinedIds = await headlinedEventIds(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => {
    const avail = availability.get(row.id) ?? emptyAvailability();
    avail.setlist = avail.setlist || Boolean(row.setlistText);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      title: row.name ?? row.billingName ?? "",
      eventType: row.eventType,
      eventDate: row.eventDate,
      eventTime: row.eventTime,
      datePrecision: row.datePrecision,
      confidence: row.confidence,
      place: row.placeId ? { id: row.placeId, name: row.placeName ?? "" } : null,
      heroImageId: row.heroImageId,
      heroImageUrl: row.heroImageId ? mediaDeliveryUrl(row.heroImageId) : null,
      media: avail,
      headlined: headlinedIds.has(row.id),
    };
  });
}

export async function getEventDetail(
  db: Db,
  slug: string,
): Promise<EventDetailDTO | null> {
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.isDeleted, false)))
    .get();
  if (!event) return null;

  const place = event.placeId
    ? ((await db
        .select()
        .from(places)
        .where(eq(places.id, event.placeId))
        .get()) ?? null)
    : null;

  const perf = await db
    .select()
    .from(eventPerformanceDetails)
    .where(eq(eventPerformanceDetails.eventId, event.id))
    .get();

  const peopleRows = await db
    .select({
      personId: eventPeople.personId,
      relationshipType: eventPeople.relationshipType,
      notes: eventPeople.notes,
      displayName: people.displayName,
    })
    .from(eventPeople)
    .innerJoin(people, eq(people.id, eventPeople.personId))
    .where(
      and(eq(eventPeople.eventId, event.id), eq(eventPeople.isDeleted, false)),
    );

  const acts = await db
    .select()
    .from(eventActs)
    .where(eq(eventActs.eventId, event.id));

  const sources = await db
    .select()
    .from(eventSources)
    .where(eq(eventSources.eventId, event.id));

  const mediaItems = await listMediaForEvent(db, event.id);
  const eventAnnotations = await getAnnotations(db, "event", event.id);

  const heroImageId = event.heroImageId ?? null;
  const posterId = perf?.eventPosterId ?? null;
  const resolvedHeroId = heroImageId ?? posterId;

  const placeDTO: PlaceDTO | null = place ? toPlaceDTO(place) : null;

  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    title: event.name ?? perf?.billingName ?? "",
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    datePrecision: event.datePrecision,
    confidence: event.confidence,
    place: place ? { id: place.id, name: place.name } : null,
    heroImageId: resolvedHeroId,
    heroImageUrl: resolvedHeroId ? mediaDeliveryUrl(resolvedHeroId) : null,
    media: {
      photo: mediaItems.some((item) => item.mediaType === "photo"),
      video: mediaItems.some((item) => item.mediaType === "video"),
      audio: mediaItems.some((item) => item.mediaType === "audio"),
      setlist: Boolean(perf?.setlistText),
    },
    headlined: isEventHeadlined(acts),
    summary: event.summary,
    placeDetail: placeDTO,
    performance: perf
      ? {
          billingName: perf.billingName,
          promotionText: perf.promotionText,
          setlistText: perf.setlistText,
          eventPosterId: perf.eventPosterId ?? null,
          eventPosterUrl: perf.eventPosterId
            ? mediaDeliveryUrl(perf.eventPosterId)
            : null,
        }
      : null,
    people: peopleRows.map((person) => ({
      personId: person.personId,
      displayName: person.displayName,
      relationshipType: person.relationshipType,
      notes: person.notes,
    })),
    acts: acts.map((act) => ({
      id: act.id,
      name: act.name,
      billingRole: act.billingRole,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      description: source.description,
      url: source.url,
      mediaId: source.mediaId ?? null,
    })),
    mediaItems,
    annotations: eventAnnotations,
  };
}
