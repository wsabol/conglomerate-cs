import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
    expect(detail.sources[0].mediaUrl).toBeNull();
    expect(detail.sources[0].thumbUrl).toBeNull();
    expect(detail.people[0].displayName).toBe("McIan");
    expect(detail.annotations).toEqual([]);
    expect(detail.headlined).toBe(false);
  });

  it("returns 404 envelope for a missing slug", async () => {
    const res = await app.request("/api/events/nope", {}, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.message).toBe("Event not found.");
    expect(body.data).toEqual({});
  });
});

describe("event headlined flag", () => {
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

  async function seedEventWithAct(
    slug: string,
    act: { name: string; billingRole: "opener" | "headliner" | "unknown" },
  ) {
    const db = getDb(env);
    const place = await db
      .insert(places)
      .values({ name: `Venue for ${slug}`, status: "unknown" })
      .returning()
      .get();
    const event = await db
      .insert(events)
      .values({
        slug,
        name: "Show",
        eventType: "performance",
        eventDate: "2010-07-02",
        datePrecision: "exact",
        placeId: place.id,
        confidence: "medium",
      })
      .returning()
      .get();
    await db.insert(eventActs).values({
      eventId: event.id,
      name: act.name,
      billingRole: act.billingRole,
    });
    return event;
  }

  it("is false when no core band is billed as headliner", async () => {
    await seed();
    const listRes = await app.request("/api/events", {}, env);
    const list = (await listRes.json()) as ApiResponse<
      ListResult<EventListItemDTO>
    >;
    for (const e of list.data!.results) {
      expect(e.headlined).toBe(false);
    }
  });

  it("is true when a core band is billed as headliner", async () => {
    await seedEventWithAct("syndicate-headline", {
      name: "The Syndicate",
      billingRole: "headliner",
    });

    const listRes = await app.request("/api/events", {}, env);
    const list = (await listRes.json()) as ApiResponse<
      ListResult<EventListItemDTO>
    >;
    expect(list.data!.results[0].headlined).toBe(true);

    const detailRes = await app.request("/api/events/syndicate-headline", {}, env);
    const detail = (await detailRes.json()) as ApiResponse<EventDetailDTO>;
    expect(detail.data!.headlined).toBe(true);
  });

  it("is false when a core band is billed as opener", async () => {
    await seedEventWithAct("syndicate-opener", {
      name: "The Syndicate",
      billingRole: "opener",
    });

    const detailRes = await app.request("/api/events/syndicate-opener", {}, env);
    const detail = (await detailRes.json()) as ApiResponse<EventDetailDTO>;
    expect(detail.data!.headlined).toBe(false);
  });

  it("is false when an unrelated act is billed as headliner", async () => {
    await seedEventWithAct("other-headline", {
      name: "Greg Tivis",
      billingRole: "headliner",
    });

    const detailRes = await app.request("/api/events/other-headline", {}, env);
    const detail = (await detailRes.json()) as ApiResponse<EventDetailDTO>;
    expect(detail.data!.headlined).toBe(false);
  });

  it("filters lineup=headliner to core band headliners only", async () => {
    await seedEventWithAct("syndicate-headline", {
      name: "The Syndicate",
      billingRole: "headliner",
    });
    await seedEventWithAct("other-headline", {
      name: "Greg Tivis",
      billingRole: "headliner",
    });

    const res = await app.request(
      "/api/events?event_type=performance&lineup=headliner",
      {},
      env,
    );
    const body = (await res.json()) as ApiResponse<ListResult<EventListItemDTO>>;
    expect(body.data?.results.map((e) => e.slug)).toEqual(["syndicate-headline"]);
    expect(body.data?.results[0].headlined).toBe(true);
  });
});

describe("PATCH /api/events/:slug performance", () => {
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

  it("preserves eventPosterId when omitted from the performance payload", async () => {
    const db = getDb(env);
    const event = await db
      .insert(events)
      .values({
        slug: "poster-show",
        name: "Poster Show",
        eventType: "performance",
        eventDate: "2010-07-02",
        datePrecision: "exact",
        confidence: "medium",
      })
      .returning()
      .get();

    await db.insert(eventPerformanceDetails).values({
      eventId: event.id,
      billingName: "The Band",
      setlistText: "1. Opener",
      eventPosterId: 42,
    });

    const res = await app.request(
      "/api/events/poster-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "Updated summary",
          performance: {
            billingName: "The Band",
            setlistText: "1. Opener",
            promotionText: null,
          },
        }),
      },
      env,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<EventDetailDTO>;
    expect(body.data?.summary).toBe("Updated summary");
    expect(body.data?.performance?.eventPosterId).toBe(42);

    const row = await db
      .select({ eventPosterId: eventPerformanceDetails.eventPosterId })
      .from(eventPerformanceDetails)
      .where(eq(eventPerformanceDetails.eventId, event.id))
      .get();
    expect(row?.eventPosterId).toBe(42);
  });
});

describe("PATCH /api/events/:slug sources", () => {
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

  it("replaces sources and clears them when given an empty array", async () => {
    const db = getDb(env);
    const event = await db
      .insert(events)
      .values({
        slug: "source-show",
        name: "Source Show",
        eventType: "performance",
        eventDate: "2010-07-02",
        datePrecision: "exact",
        confidence: "medium",
      })
      .returning()
      .get();

    const replaceRes = await app.request(
      "/api/events/source-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: [
            {
              sourceType: "url",
              description: "Facebook post",
              url: "https://example.com/post",
            },
            {
              sourceType: "text",
              description: "Someone said they were there.",
            },
          ],
        }),
      },
      env,
    );
    expect(replaceRes.status).toBe(200);
    const replaced = (await replaceRes.json()) as ApiResponse<EventDetailDTO>;
    expect(replaced.data?.sources).toHaveLength(2);
    expect(replaced.data?.sources[0].description).toBe("Facebook post");
    expect(replaced.data?.sources[1].sourceType).toBe("text");

    const updateRes = await app.request(
      "/api/events/source-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: [
            {
              sourceType: "url",
              description: "Updated link",
              url: "https://example.com/updated",
            },
          ],
        }),
      },
      env,
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as ApiResponse<EventDetailDTO>;
    expect(updated.data?.sources).toHaveLength(1);
    expect(updated.data?.sources[0].description).toBe("Updated link");

    const clearRes = await app.request(
      "/api/events/source-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: [] }),
      },
      env,
    );
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as ApiResponse<EventDetailDTO>;
    expect(cleared.data?.sources).toEqual([]);

    const rows = await db
      .select()
      .from(eventSources)
      .where(eq(eventSources.eventId, event.id));
    expect(rows).toHaveLength(0);
  });
});

describe("PATCH /api/events/:slug people", () => {
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

  it("replaces people and clears them when given an empty array", async () => {
    const db = getDb(env);
    const personA = await db
      .insert(people)
      .values({ displayName: "McIan" })
      .returning()
      .get();
    const personB = await db
      .insert(people)
      .values({ displayName: "Greg" })
      .returning()
      .get();
    const event = await db
      .insert(events)
      .values({
        slug: "people-show",
        name: "People Show",
        eventType: "performance",
        eventDate: "2010-07-02",
        datePrecision: "exact",
        confidence: "medium",
      })
      .returning()
      .get();

    const replaceRes = await app.request(
      "/api/events/people-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: [
            { personId: personA.id, relationshipType: "performer" },
            { personId: personB.id, relationshipType: "photographer" },
          ],
        }),
      },
      env,
    );
    expect(replaceRes.status).toBe(200);
    const replaced = (await replaceRes.json()) as ApiResponse<EventDetailDTO>;
    expect(replaced.data?.people).toHaveLength(2);
    expect(replaced.data?.people[0].displayName).toBe("McIan");
    expect(replaced.data?.people[0].relationshipType).toBe("performer");
    expect(replaced.data?.people[1].relationshipType).toBe("photographer");

    const updateRes = await app.request(
      "/api/events/people-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: [{ personId: personB.id, relationshipType: "organizer" }],
        }),
      },
      env,
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as ApiResponse<EventDetailDTO>;
    expect(updated.data?.people).toHaveLength(1);
    expect(updated.data?.people[0].displayName).toBe("Greg");
    expect(updated.data?.people[0].relationshipType).toBe("organizer");

    const clearRes = await app.request(
      "/api/events/people-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people: [] }),
      },
      env,
    );
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as ApiResponse<EventDetailDTO>;
    expect(cleared.data?.people).toEqual([]);

    const rows = await db
      .select()
      .from(eventPeople)
      .where(eq(eventPeople.eventId, event.id));
    expect(rows).toHaveLength(0);
  });

  it("rejects duplicate person and relationship type combinations", async () => {
    const db = getDb(env);
    const person = await db
      .insert(people)
      .values({ displayName: "McIan" })
      .returning()
      .get();
    await db
      .insert(events)
      .values({
        slug: "dup-people-show",
        name: "Dup People Show",
        eventType: "performance",
        eventDate: "2010-07-02",
        datePrecision: "exact",
        confidence: "medium",
      })
      .returning()
      .get();

    const res = await app.request(
      "/api/events/dup-people-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: [
            { personId: person.id, relationshipType: "performer" },
            { personId: person.id, relationshipType: "performer" },
          ],
        }),
      },
      env,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("PATCH /api/events/:slug acts", () => {
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

  it("clears acts when given an empty array", async () => {
    const db = getDb(env);
    const event = await db
      .insert(events)
      .values({
        slug: "acts-show",
        name: "Acts Show",
        eventType: "performance",
        eventDate: "2010-07-02",
        datePrecision: "exact",
        confidence: "medium",
      })
      .returning()
      .get();

    const replaceRes = await app.request(
      "/api/events/acts-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acts: [{ name: "Greg Tivis", billingRole: "opener" }],
        }),
      },
      env,
    );
    expect(replaceRes.status).toBe(200);
    const replaced = (await replaceRes.json()) as ApiResponse<EventDetailDTO>;
    expect(replaced.data?.acts).toHaveLength(1);

    const clearRes = await app.request(
      "/api/events/acts-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acts: [] }),
      },
      env,
    );
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as ApiResponse<EventDetailDTO>;
    expect(cleared.data?.acts).toEqual([]);

    const rows = await db
      .select()
      .from(eventActs)
      .where(eq(eventActs.eventId, event.id));
    expect(rows).toHaveLength(0);
  });
});
