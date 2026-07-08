import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../../client";
import { eventActs } from "../../schema";
import { HEADLINER_ACT_NAMES, type BillingRole } from "@shared/types";

export function isHeadlinerActName(name: string): boolean {
  return HEADLINER_ACT_NAMES.some(
    (headliner) => headliner.toLowerCase() === name.toLowerCase(),
  );
}

export function isEventHeadlined(
  acts: { name: string; billingRole: BillingRole }[],
): boolean {
  return acts.some(
    (act) => act.billingRole === "headliner" && isHeadlinerActName(act.name),
  );
}

export function headlinerActNameCondition() {
  return or(
    ...HEADLINER_ACT_NAMES.map(
      (name) => sql`lower(${eventActs.name}) = ${name.toLowerCase()}`,
    ),
  );
}

export async function headlinedEventIds(
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
    if (isHeadlinerActName(row.name)) {
      ids.add(row.eventId);
    }
  }
  return ids;
}
