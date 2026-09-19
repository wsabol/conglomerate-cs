import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  eventPerformanceDetails,
  eventSources,
  events,
  media,
  objectRevisions,
  users,
} from "../../src/server/db/schema";
import { sha256Hex } from "../../src/shared/checksum";
import type { ApiResponse } from "../../src/shared/types";
import type { EventDetailDTO, MediaItemDTO } from "../../src/shared/dto";

interface UploadTarget {
  mediaId: number;
}

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function seedEvent() {
  const db = getDb(env);
  const event = await db
    .insert(events)
    .values({
      slug: "source-media-show",
      name: "Source Media Show",
      eventType: "performance",
      eventDate: "2011-05-14",
      datePrecision: "exact",
      confidence: "medium",
    })
    .returning()
    .get();
  await db.insert(eventPerformanceDetails).values({
    eventId: event.id,
    billingName: "Source Media Show",
  });
  return event;
}

async function publishPhoto(
  eventId: number,
  bytes: ArrayBuffer,
  filename: string,
  purpose: "gallery" | "source" = "gallery",
) {
  const checksum = await sha256Hex(bytes);
  const begin = await app.request(
    "/api/uploads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        filename,
        mimeType: "image/jpeg",
        size: bytes.byteLength,
        title: filename,
        checksum,
        purpose,
      }),
    },
    env,
  );
  expect(begin.status).toBe(201);
  const beginBody = (await begin.json()) as ApiResponse<UploadTarget>;
  const mediaId = beginBody.data!.mediaId;

  const put = await app.request(
    `/api/uploads/${mediaId}/body`,
    {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: bytes,
    },
    env,
  );
  expect(put.status).toBe(200);

  const complete = await app.request(
    `/api/uploads/${mediaId}/complete`,
    { method: "POST" },
    env,
  );
  expect(complete.status).toBe(200);
  const completeBody = (await complete.json()) as ApiResponse<MediaItemDTO>;
  return { mediaId, dto: completeBody.data! };
}

async function getEvent() {
  const res = await app.request("/api/events/source-media-show", {}, env);
  expect(res.status).toBe(200);
  const body = (await res.json()) as ApiResponse<EventDetailDTO>;
  return body.data!;
}

describe("source-purpose media uploads", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(objectRevisions);
    await db.delete(eventSources);
    await db.delete(media);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
    await db.delete(users);
  });

  it("sets the first gallery photo as hero and includes it in event media", async () => {
    const event = await seedEvent();
    const { mediaId } = await publishPhoto(
      event.id,
      bytesOf("gallery-hero-photo"),
      "live.jpg",
    );

    const detail = await getEvent();
    expect(detail.heroImageId).toBe(mediaId);
    expect(detail.heroImageUrl).toBe(`/media/${mediaId}`);
    expect(detail.mediaItems.map((item) => item.id)).toEqual([mediaId]);
  });

  it("keeps source screenshots on the source, out of the gallery and off the hero", async () => {
    const event = await seedEvent();
    const { mediaId } = await publishPhoto(
      event.id,
      bytesOf("facebook-screenshot"),
      "fb-event.jpg",
      "source",
    );

    const attach = await app.request(
      "/api/events/source-media-show",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: [
            {
              sourceType: "media",
              description: "Facebook event screenshot",
              mediaId,
            },
          ],
        }),
      },
      env,
    );
    expect(attach.status).toBe(200);

    const detail = await getEvent();
    expect(detail.heroImageId).toBeNull();
    expect(detail.heroImageUrl).toBeNull();
    expect(detail.mediaItems).toEqual([]);
    expect(detail.sources).toEqual([
      expect.objectContaining({
        sourceType: "media",
        mediaId,
        mediaUrl: `/media/${mediaId}`,
        description: "Facebook event screenshot",
      }),
    ]);
  });

  it("does not let a later source screenshot steal an existing hero", async () => {
    const event = await seedEvent();
    const gallery = await publishPhoto(
      event.id,
      bytesOf("stage-photo"),
      "stage.jpg",
    );
    const source = await publishPhoto(
      event.id,
      bytesOf("updated-source-screenshot"),
      "fb-event-2.jpg",
      "source",
    );

    const detail = await getEvent();
    expect(detail.heroImageId).toBe(gallery.mediaId);
    expect(detail.mediaItems.map((item) => item.id)).toEqual([gallery.mediaId]);
    expect(detail.mediaItems.map((item) => item.id)).not.toContain(
      source.mediaId,
    );
  });
});
