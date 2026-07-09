import { and, count, countDistinct, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { eventActs, events } from "../schema";
import type { ArchiveStatsDTO } from "@shared/dto";
import { HEADLINER_ACT_NAMES } from "@shared/types";

function performanceEvents() {
  return and(eq(events.isDeleted, false), eq(events.eventType, "performance"));
}

function notHeadlinerAct() {
  return and(
    ...HEADLINER_ACT_NAMES.map(
      (name) => sql`lower(${eventActs.name}) != ${name.toLowerCase()}`,
    ),
  );
}

export async function getArchiveStats(
  db: Db,
  yearsActive: { start: number; end: number },
): Promise<ArchiveStatsDTO> {
  const performanceCondition = performanceEvents();

  const [performanceRow, venueRow, actRow] = await Promise.all([
    db
      .select({ count: count() })
      .from(events)
      .where(performanceCondition)
      .get(),
    db
      .select({ count: countDistinct(events.placeId) })
      .from(events)
      .where(and(performanceCondition, isNotNull(events.placeId)))
      .get(),
    db
      .select({ count: countDistinct(eventActs.name) })
      .from(eventActs)
      .innerJoin(events, eq(eventActs.eventId, events.id))
      .where(and(performanceCondition, notHeadlinerAct()))
      .get(),
  ]);

  return {
    performanceCount: performanceRow?.count ?? 0,
    yearsActive,
    venueCount: venueRow?.count ?? 0,
    actCount: actRow?.count ?? 0,
  };
}
