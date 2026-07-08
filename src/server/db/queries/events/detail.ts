import { and, eq } from "drizzle-orm";
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
import type { EventDetailDTO, PlaceDTO } from "@shared/dto";
import { mediaDeliveryUrl, mediaThumbUrl } from "../../../media/url";
import { getAnnotations } from "../annotations";
import { toPlaceDTO } from "../helpers";
import { listMediaForEvent } from "../media";
import { isEventHeadlined } from "./headliner";

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
      mediaUrl: source.mediaId ? mediaDeliveryUrl(source.mediaId) : null,
      thumbUrl: source.mediaId ? mediaThumbUrl(source.mediaId) : null,
    })),
    mediaItems,
    annotations: eventAnnotations,
  };
}
