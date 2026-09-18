import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import type { Db } from "../client";
import { events, places } from "../schema";

/**
 * Evidence includes exact-date events on the same or next calendar day.
 * Reverse the window for dependents: same-day and previous-day narratives
 * can consume this event. Neither direction requires shared relationships.
 */
export async function getNearbyNarrativeEvents(
  db: Db,
  eventId: number,
  direction: "evidence" | "dependents" = "evidence",
) {
  const source = await db.select({ date: events.eventDate, precision: events.datePrecision })
    .from(events).where(and(eq(events.id, eventId), eq(events.isDeleted, false))).get();
  if (!source?.date || source.precision !== "exact") return [];
  const adjacent = new Date(`${source.date}T00:00:00Z`);
  adjacent.setUTCDate(adjacent.getUTCDate() + (direction === "evidence" ? 1 : -1));
  const adjacentDate = adjacent.toISOString().slice(0, 10);
  return db.select({ id: events.id, name: events.name, date: events.eventDate, place: places.name })
    .from(events).leftJoin(places, eq(places.id, events.placeId))
    .where(and(
      eq(events.isDeleted, false), eq(events.datePrecision, "exact"), ne(events.id, eventId),
      gte(events.eventDate, direction === "evidence" ? source.date : adjacentDate),
      lte(events.eventDate, direction === "evidence" ? adjacentDate : source.date),
    )).orderBy(asc(events.eventDate), asc(events.id));
}
