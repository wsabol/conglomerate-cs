import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  eventActs,
  eventPerformanceDetails,
  events,
} from "../../src/server/db/schema";
import type { ApiResponse, ListResult } from "../../src/shared/types";

async function seed() {
  const db = getDb(env);

  const older = await db
    .insert(events)
    .values({
      slug: "the-syndicate-2010-07-02",
      name: "The Syndicate",
      eventType: "performance",
      eventDate: "2010-07-02",
      datePrecision: "exact",
      confidence: "medium",
    })
    .returning()
    .get();

  const newer = await db
    .insert(events)
    .values({
      slug: "rock-your-independence-2011-07-03",
      name: "Rock Your Independence",
      eventType: "performance",
      eventDate: "2011-07-03",
      datePrecision: "exact",
      confidence: "high",
    })
    .returning()
    .get();

  await db.insert(eventActs).values([
    { eventId: older.id, name: "Greg Tivis", billingRole: "opener" },
    { eventId: older.id, name: "The Lick", billingRole: "unknown" },
    { eventId: newer.id, name: "Greg Tivis", billingRole: "headliner" },
    { eventId: newer.id, name: "Side Project", billingRole: "opener" },
  ]);

  return { older, newer };
}

describe("GET /api/acts", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(eventActs);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
  });

  it("returns distinct act names sorted alphabetically", async () => {
    await seed();
    const res = await app.request("/api/acts", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ListResult<string>>;
    expect(body.message).toBe("Returned act names");
    expect(body.data?.results).toEqual([
      "Greg Tivis",
      "Side Project",
      "The Lick",
    ]);
  });

  it("returns an empty list when no acts exist", async () => {
    const res = await app.request("/api/acts", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ListResult<string>>;
    expect(body.data?.results).toEqual([]);
  });
});
