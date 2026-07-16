import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  eventPerformanceDetails,
  events,
  media,
  objectRevisions,
  users,
} from "../../src/server/db/schema";
import type { ApiResponse } from "../../src/shared/types";
import type { EventDetailDTO } from "../../src/shared/dto";

async function seedEventWithMedia() {
  const db = getDb(env);
  const event = await db
    .insert(events)
    .values({
      slug: "media-roles-show",
      name: "Media Roles Show",
      eventType: "performance",
      eventDate: "2011-05-14",
      datePrecision: "exact",
      confidence: "high",
    })
    .returning()
    .get();

  await db.insert(eventPerformanceDetails).values({
    eventId: event.id,
    billingName: "Media Roles Show",
  });

  const photoA = await db
    .insert(media)
    .values({
      eventId: event.id,
      title: "Photo A",
      mediaType: "photo",
      status: "published",
      mimeType: "image/jpeg",
      r2Key: "media/a.jpg",
    })
    .returning()
    .get();

  const photoB = await db
    .insert(media)
    .values({
      eventId: event.id,
      title: "Photo B",
      mediaType: "photo",
      status: "published",
      mimeType: "image/jpeg",
      r2Key: "media/b.jpg",
    })
    .returning()
    .get();

  return { event, photoA, photoB };
}

describe("event media hero/poster roles", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(objectRevisions);
    await db.delete(media);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
    await db.delete(users);
  });

  it("PATCHes heroImageId and eventPosterId, and clears them", async () => {
    const { photoA, photoB } = await seedEventWithMedia();

    const setRes = await app.request(
      "/api/events/media-roles-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroImageId: photoA.id,
          performance: {
            billingName: "Media Roles Show",
            promotionText: null,
            setlistText: null,
            eventPosterId: photoB.id,
          },
        }),
      },
      env,
    );
    expect(setRes.status).toBe(200);
    const setBody = (await setRes.json()) as ApiResponse<EventDetailDTO>;
    expect(setBody.data?.heroImageId).toBe(photoA.id);
    expect(setBody.data?.heroImageUrl).toBe(`/media/${photoA.id}`);
    expect(setBody.data?.performance?.eventPosterId).toBe(photoB.id);
    expect(setBody.data?.performance?.eventPosterUrl).toBe(
      `/media/${photoB.id}`,
    );

    const clearRes = await app.request(
      "/api/events/media-roles-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroImageId: null,
          performance: {
            billingName: "Media Roles Show",
            promotionText: null,
            setlistText: null,
            eventPosterId: null,
          },
        }),
      },
      env,
    );
    expect(clearRes.status).toBe(200);
    const clearBody = (await clearRes.json()) as ApiResponse<EventDetailDTO>;
    expect(clearBody.data?.heroImageId).toBeNull();
    // Display falls back to poster; with both cleared, URL is null.
    expect(clearBody.data?.heroImageUrl).toBeNull();
    expect(clearBody.data?.performance?.eventPosterId).toBeNull();
  });

  it("returns raw heroImageId while heroImageUrl falls back to poster", async () => {
    const db = getDb(env);
    const { event, photoB } = await seedEventWithMedia();

    await db
      .update(eventPerformanceDetails)
      .set({ eventPosterId: photoB.id })
      .where(eq(eventPerformanceDetails.eventId, event.id));

    const res = await app.request("/api/events/media-roles-show", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<EventDetailDTO>;
    expect(body.data?.heroImageId).toBeNull();
    expect(body.data?.heroImageUrl).toBe(`/media/${photoB.id}`);
    expect(body.data?.performance?.eventPosterId).toBe(photoB.id);
  });

  it("clears hero and poster FKs when media is soft-deleted", async () => {
    const db = getDb(env);
    const { event, photoA, photoB } = await seedEventWithMedia();

    await db
      .update(events)
      .set({ heroImageId: photoA.id })
      .where(eq(events.id, event.id));
    await db
      .update(eventPerformanceDetails)
      .set({ eventPosterId: photoB.id })
      .where(eq(eventPerformanceDetails.eventId, event.id));

    const delHero = await app.request(
      `/api/media/${photoA.id}`,
      { method: "DELETE" },
      env,
    );
    expect(delHero.status).toBe(200);

    const delPoster = await app.request(
      `/api/media/${photoB.id}`,
      { method: "DELETE" },
      env,
    );
    expect(delPoster.status).toBe(200);

    const eventRow = await db
      .select({ heroImageId: events.heroImageId })
      .from(events)
      .where(eq(events.id, event.id))
      .get();
    expect(eventRow?.heroImageId).toBeNull();

    const perfRow = await db
      .select({ eventPosterId: eventPerformanceDetails.eventPosterId })
      .from(eventPerformanceDetails)
      .where(eq(eventPerformanceDetails.eventId, event.id))
      .get();
    expect(perfRow?.eventPosterId).toBeNull();

    const detailRes = await app.request(
      "/api/events/media-roles-show",
      {},
      env,
    );
    const detail = (await detailRes.json()) as ApiResponse<EventDetailDTO>;
    expect(detail.data?.heroImageId).toBeNull();
    expect(detail.data?.heroImageUrl).toBeNull();
    expect(detail.data?.performance?.eventPosterId).toBeNull();
    expect(detail.data?.mediaItems).toHaveLength(0);
  });
});
