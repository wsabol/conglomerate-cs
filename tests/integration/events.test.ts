import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  eventActs,
  eventPeople,
  eventPerformanceDetails,
  eventSources,
  events,
  people,
  places,
} from "../../src/server/db/schema";
import type { ApiResponse, ListResult } from "../../src/shared/types";
import type { EventDetailDTO, EventListItemDTO } from "../../src/shared/dto";

async function seed() {
  const db = getDb(env);
  const place = await db
    .insert(places)
    .values({ name: "Muldoon's", status: "unknown" })
    .returning()
    .get();
  const person = await db
    .insert(people)
    .values({ displayName: "McIan" })
    .returning()
    .get();

  const older = await db
    .insert(events)
    .values({
      slug: "the-syndicate-2010-07-02",
      name: "The Syndicate",
      eventType: "performance",
      eventDate: "2010-07-02",
      eventTime: "20:00",
      datePrecision: "exact",
      placeId: place.id,
      summary: "A funk night.",
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
      summary: "Independence show.",
      confidence: "high",
    })
    .returning()
    .get();

  await db
    .insert(eventPerformanceDetails)
    .values({ eventId: older.id, setlistText: "1. Opener\n2. The Lick" });
  await db
    .insert(eventActs)
    .values({ eventId: older.id, name: "Greg Tivis", billingRole: "opener" });
  await db
    .insert(eventSources)
    .values({ eventId: older.id, sourceType: "url", url: "https://example.com/post" });
  await db
    .insert(eventPeople)
    .values({ eventId: older.id, personId: person.id, relationshipType: "performer" });

  return { placeId: place.id, personId: person.id, older, newer };
}

describe("GET /api/events", () => {
  beforeEach(async () => {
    const db = getDb(env);
    // Clean slate per test (order matters for FKs).
    await db.delete(eventPeople);
    await db.delete(eventSources);
    await db.delete(eventActs);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
    await db.delete(people);
    await db.delete(places);
  });

  it("returns a list envelope sorted by most recently modified", async () => {
    await seed();
    const res = await app.request("/api/events", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ListResult<EventListItemDTO>>;
    expect(body.message).toBe("Returned event list");
    expect(body.data?.results.length).toBe(2);
    // most recently inserted (newer) modified last -> appears first
    expect(body.data?.results[0].slug).toBe("rock-your-independence-2011-07-03");
  });

  it("filters by year", async () => {
    await seed();
    const res = await app.request("/api/events?year=2010", {}, env);
    const body = (await res.json()) as ApiResponse<ListResult<EventListItemDTO>>;
    expect(body.data?.results.length).toBe(1);
    expect(body.data?.results[0].slug).toBe("the-syndicate-2010-07-02");
  });

  it("filters by person", async () => {
    const { personId } = await seed();
    const res = await app.request(`/api/events?person=${personId}`, {}, env);
    const body = (await res.json()) as ApiResponse<ListResult<EventListItemDTO>>;
    expect(body.data?.results.length).toBe(1);
    expect(body.data?.results[0].slug).toBe("the-syndicate-2010-07-02");
  });

  it("sorts by date when requested", async () => {
    await seed();
    const res = await app.request("/api/events?sort=date", {}, env);
    const body = (await res.json()) as ApiResponse<ListResult<EventListItemDTO>>;
    expect(body.data?.results[0].slug).toBe("rock-your-independence-2011-07-03");
  });
});

describe("GET /api/events/:slug", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(eventPeople);
    await db.delete(eventSources);
    await db.delete(eventActs);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
    await db.delete(people);
    await db.delete(places);
  });

  it("returns the full aggregate", async () => {
    await seed();
    const res = await app.request(
      "/api/events/the-syndicate-2010-07-02",
      {},
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<EventDetailDTO>;
    const detail = body.data!;
    expect(detail.title).toBe("The Syndicate");
    expect(detail.place?.name).toBe("Muldoon's");
    expect(detail.performance?.setlistText).toContain("The Lick");
    expect(detail.acts[0].name).toBe("Greg Tivis");
    expect(detail.sources[0].url).toBe("https://example.com/post");
    expect(detail.people[0].displayName).toBe("McIan");
    expect(detail.annotations).toEqual([]);
  });

  it("returns 404 envelope for a missing slug", async () => {
    const res = await app.request("/api/events/nope", {}, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.message).toBe("Event not found.");
    expect(body.data).toEqual({});
  });
});
