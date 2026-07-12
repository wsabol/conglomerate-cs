import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../client";
import {
  eventActs,
  eventPeople,
  eventPerformanceDetails,
  eventSources,
  events,
  people,
  places,
} from "../../schema";
import type { EventsQuery } from "@shared/schemas/query";
import type { EventDetailDTO, EventSchemaDTO, PlaceDTO } from "@shared/dto";
import { mediaDeliveryUrl, mediaThumbUrl } from "../../../media/url";
import { getAnnotations } from "../annotations";
import { toPlaceDTO } from "../helpers";
import { listMediaForEvent } from "../media";
import { eventListConditions } from "./list";
import { isEventHeadlined } from "./headliner";

async function loadEventAggregate(db: Db, slug: string) {
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.isDeleted, false)))
    .get();
  if (!event) return null;

  const [
    place,
    perf,
    peopleRows,
    acts,
    sources,
    mediaItems,
    eventAnnotations,
  ] = await Promise.all([
    event.placeId
      ? db
          .select()
          .from(places)
          .where(eq(places.id, event.placeId))
          .get()
          .then((row) => row ?? null)
      : Promise.resolve(null),
    db
      .select()
      .from(eventPerformanceDetails)
      .where(eq(eventPerformanceDetails.eventId, event.id))
      .get(),
    db
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
      ),
    db.select().from(eventActs).where(eq(eventActs.eventId, event.id)),
    db.select().from(eventSources).where(eq(eventSources.eventId, event.id)),
    listMediaForEvent(db, event.id),
    getAnnotations(db, "event", event.id),
  ]);

  const heroImageId = event.heroImageId ?? null;
  const posterId = perf?.eventPosterId ?? null;
  const resolvedHeroId = heroImageId ?? posterId;
  const placeDTO: PlaceDTO | null = place ? toPlaceDTO(place) : null;

  return {
    event,
    place,
    perf,
    peopleRows,
    acts,
    sources,
    mediaItems,
    eventAnnotations,
    resolvedHeroId,
    placeDTO,
  };
}

function baseEventFields(
  data: NonNullable<Awaited<ReturnType<typeof loadEventAggregate>>>,
) {
  const { event, place, perf, peopleRows, acts, sources, eventAnnotations, resolvedHeroId } =
    data;

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
    summary: event.summary,
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
      mediaUrl: source.mediaId ? mediaDeliveryUrl(source.mediaId) : null,
      thumbUrl: source.mediaId ? mediaThumbUrl(source.mediaId) : null,
    })),
    annotations: eventAnnotations,
  };
}

export async function getEventDetail(
  db: Db,
  slug: string,
): Promise<EventDetailDTO | null> {
  const data = await loadEventAggregate(db, slug);
  if (!data) return null;

  const { acts, mediaItems, perf, placeDTO } = data;

  return {
    ...baseEventFields(data),
    media: {
      photo: mediaItems.some((item) => item.mediaType === "photo"),
      video: mediaItems.some((item) => item.mediaType === "video"),
      audio: mediaItems.some((item) => item.mediaType === "audio"),
      setlist: Boolean(perf?.setlistText),
    },
    headlined: isEventHeadlined(acts),
    placeDetail: placeDTO,
    mediaItems,
  };
}

export async function getEventSchema(
  db: Db,
  slug: string,
): Promise<EventSchemaDTO | null> {
  const data = await loadEventAggregate(db, slug);
  if (!data) return null;

  return {
    ...baseEventFields(data),
    mediaItems: data.mediaItems,
  };
}

/** Full event aggregates for export/QA; sorted by date ascending. */
export async function listEventsDetailed(
  db: Db,
  q: EventsQuery,
): Promise<EventSchemaDTO[]> {
  const slugs = await db
    .select({ slug: events.slug })
    .from(events)
    .where(and(...eventListConditions(db, q)))
    .orderBy(asc(events.eventDate));

  const details = await Promise.all(
    slugs.map((row) => getEventSchema(db, row.slug)),
  );
  return details.filter((d): d is EventSchemaDTO => d !== null);
}
