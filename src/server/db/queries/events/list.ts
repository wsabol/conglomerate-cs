import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import type { Db } from "../../client";
import {
  eventActs,
  eventPeople,
  eventPerformanceDetails,
  events,
  media,
  places,
} from "../../schema";
import type { EventsQuery } from "@shared/schemas/query";
import type { EventListItemDTO, MediaAvailabilityDTO } from "@shared/dto";
import type { BillingRole } from "@shared/types";
import { mediaDeliveryUrl } from "../../../media/url";
import { emptyAvailability } from "../helpers";
import { headlinedEventIds, headlinerActNameCondition } from "./headliner";

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

function lineupActConditions(lineup: BillingRole) {
  const conds = [eq(eventActs.billingRole, lineup)];
  if (lineup === "headliner") {
    const nameMatch = headlinerActNameCondition();
    if (nameMatch) conds.push(nameMatch);
  }
  return and(...conds);
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
