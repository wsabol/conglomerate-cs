import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { annotations, events, media, objectRevisions, people, users } from "../../src/server/db/schema";
import type { ApiResponse, ListResult } from "../../src/shared/types";
import type { EventListItemDTO, RecentActivityDTO } from "../../src/shared/dto";

describe("home page data", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(objectRevisions);
    await db.delete(annotations);
    await db.delete(media);
    await db.delete(events);
    await db.delete(users);
    await db.delete(people);
  });

  it("ranks high confidence events by annotations plus published media", async () => {
    const db = getDb(env);
    const [first, second, excluded] = await db.insert(events).values([
      { slug: "home-first", name: "First", confidence: "high" },
      { slug: "home-second", name: "Second", confidence: "high" },
      { slug: "home-excluded", name: "Excluded", confidence: "medium" },
    ]).returning();
    await db.insert(annotations).values([
      { targetType: "event", targetId: first.id, body: "Memory one" },
      { targetType: "event", targetId: first.id, body: "Memory two", isDeleted: true },
      { targetType: "event", targetId: second.id, body: "Memory three" },
      { targetType: "event", targetId: excluded.id, body: "Memory four" },
    ]);
    await db.insert(media).values([
      { eventId: second.id, mediaType: "photo", status: "published" },
      { eventId: second.id, mediaType: "photo", status: "uploading" },
      { eventId: excluded.id, mediaType: "photo", status: "published" },
    ]);

    const response = await app.request("/api/events?sort=popular&confidence=high&limit=4", {}, env);
    expect(response.status).toBe(200);
    const body = await response.json() as ApiResponse<ListResult<EventListItemDTO>>;
    expect(body.data?.results.map((event) => event.slug)).toEqual(["home-second", "home-first"]);
  });

  it("shows creation history with person names and event links", async () => {
    const db = getDb(env);
    const person = await db.insert(people).values({ displayName: "Ryan" }).returning().get();
    const user = await db.insert(users).values({ email: "ryan@example.com", personId: person.id }).returning().get();
    const event = await db.insert(events).values({ slug: "home-show", name: "The Show" }).returning().get();
    const photo = await db.insert(media).values({ eventId: event.id, mediaType: "photo", status: "published" }).returning().get();
    const comment = await db.insert(annotations).values({ targetType: "media", targetId: photo.id, body: "Great night", authorId: user.id }).returning().get();
    await db.insert(objectRevisions).values([
      { targetType: "event", targetId: event.id, action: "create", changedBy: user.id },
      { targetType: "annotation", targetId: comment.id, action: "create", changedBy: user.id },
      { targetType: "annotation", targetId: comment.id, action: "update", changedBy: user.id },
    ]);

    const response = await app.request("/api/stats/activity", {}, env);
    expect(response.status).toBe(200);
    const body = await response.json() as ApiResponse<RecentActivityDTO[]>;
    expect(body.data?.map(({ kind, actorName, eventName, eventSlug }) => ({ kind, actorName, eventName, eventSlug }))).toEqual([
      { kind: "annotation", actorName: "Ryan", eventName: "The Show", eventSlug: "home-show" },
      { kind: "event", actorName: "Ryan", eventName: "The Show", eventSlug: "home-show" },
    ]);
  });
});
