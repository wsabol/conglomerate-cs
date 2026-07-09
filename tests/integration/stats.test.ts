import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  eventActs,
  events,
  places,
} from "../../src/server/db/schema";
import type { ApiResponse } from "../../src/shared/types";
import type { ArchiveStatsDTO } from "../../src/shared/dto";

async function seed() {
  const db = getDb(env);

  const muldoons = await db
    .insert(places)
    .values({ name: "Muldoon's", status: "unknown" })
    .returning()
    .get();
  const warehouse = await db
    .insert(places)
    .values({ name: "The Warehouse", status: "unknown" })
    .returning()
    .get();

  const showA = await db
    .insert(events)
    .values({
      slug: "stats-show-a",
      name: "Show A",
      eventType: "performance",
      eventDate: "2010-07-02",
      datePrecision: "exact",
      placeId: muldoons.id,
      confidence: "medium",
    })
    .returning()
    .get();

  const showB = await db
    .insert(events)
    .values({
      slug: "stats-show-b",
      name: "Show B",
      eventType: "performance",
      eventDate: "2011-07-03",
      datePrecision: "exact",
      placeId: warehouse.id,
      confidence: "high",
    })
    .returning()
    .get();

  await db.insert(events).values({
    slug: "stats-rehearsal",
    name: "Rehearsal",
    eventType: "rehearsal",
    eventDate: "2011-07-04",
    datePrecision: "exact",
    confidence: "medium",
  });

  await db.insert(eventActs).values([
    { eventId: showA.id, name: "Greg Tivis", billingRole: "opener" },
    { eventId: showA.id, name: "The Conglomerate", billingRole: "headliner" },
    { eventId: showB.id, name: "Side Project", billingRole: "opener" },
    { eventId: showB.id, name: "Greg Tivis", billingRole: "unknown" },
  ]);
}

describe("GET /api/stats", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(eventActs);
    await db.delete(events);
    await db.delete(places);
  });

  it("returns archive totals for performances, venues, and acts", async () => {
    await seed();

    const res = await app.request("/api/stats", {}, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<ArchiveStatsDTO>;
    expect(body.message).toBe("Returned archive stats");
    expect(body.data).toEqual({
      performanceCount: 2,
      yearsActive: { start: 2009, end: 2016 },
      venueCount: 2,
      actCount: 2,
    });
  });
});
