import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
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
import type { EventDetailDTO, MediaItemDTO, UploadBeginDTO } from "../../src/shared/dto";

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function seedEvent(
  slug = "source-media-show",
  name = "Source Media Show",
) {
  const db = getDb(env);
  const event = await db
    .insert(events)
    .values({
      slug,
      name,
      eventType: "performance",
      eventDate: "2011-05-14",
      datePrecision: "exact",
      confidence: "medium",
    })
    .returning()
    .get();
  await db.insert(eventPerformanceDetails).values({
    eventId: event.id,
    billingName: name,
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
  const beginBody = (await begin.json()) as ApiResponse<UploadBeginDTO>;
  if (begin.status === 200 && beginBody.data?.reused) {
    return { mediaId: beginBody.data.media.id, dto: beginBody.data.media };
  }
  expect(begin.status).toBe(201);
  expect(beginBody.data?.reused).toBe(false);
  const mediaId = beginBody.data && !beginBody.data.reused
    ? beginBody.data.mediaId
    : undefined;
  expect(mediaId).toBeDefined();

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
  return { mediaId: mediaId!, dto: completeBody.data! };
}

async function getEvent(slug = "source-media-show") {
  const res = await app.request(`/api/events/${slug}`, {}, env);
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

  it("reuses the same published file as a source on another event", async () => {
    const first = await seedEvent();
    const second = await seedEvent("source-media-show-2", "Source Media Show 2");
    const bytes = bytesOf("shared-facebook-screenshot");
    const { mediaId } = await publishPhoto(
      first.id,
      bytes,
      "fb-event.jpg",
      "source",
    );

    const reused = await publishPhoto(
      second.id,
      bytes,
      "fb-event-again.jpg",
      "source",
    );
    expect(reused.mediaId).toBe(mediaId);

    await app.request(
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
    const attachSecond = await app.request(
      "/api/events/source-media-show-2",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: [
            {
              sourceType: "media",
              description: "Same screenshot, later event",
              mediaId,
            },
          ],
        }),
      },
      env,
    );
    expect(attachSecond.status).toBe(200);

    const firstDetail = await getEvent();
    const secondDetail = await getEvent("source-media-show-2");
    expect(firstDetail.mediaItems).toEqual([]);
    expect(secondDetail.mediaItems).toEqual([]);
    expect(firstDetail.heroImageId).toBeNull();
    expect(secondDetail.heroImageId).toBeNull();
    expect(firstDetail.sources[0]?.mediaId).toBe(mediaId);
    expect(secondDetail.sources[0]?.mediaId).toBe(mediaId);

    const published = await getDb(env)
      .select()
      .from(media)
      .where(eq(media.status, "published"));
    expect(published).toHaveLength(1);
  });

  it("reuses a gallery original when citing the same file as a source elsewhere", async () => {
    const first = await seedEvent();
    const second = await seedEvent("source-media-show-2", "Source Media Show 2");
    const bytes = bytesOf("poster-also-used-as-source");
    const { mediaId } = await publishPhoto(first.id, bytes, "poster.jpg");

    const reused = await publishPhoto(
      second.id,
      bytes,
      "poster-source.jpg",
      "source",
    );
    expect(reused.mediaId).toBe(mediaId);

    const firstDetail = await getEvent();
    expect(firstDetail.heroImageId).toBe(mediaId);
    expect(firstDetail.mediaItems.map((item) => item.id)).toEqual([mediaId]);

    const secondDetail = await getEvent("source-media-show-2");
    expect(secondDetail.heroImageId).toBeNull();
    expect(secondDetail.mediaItems).toEqual([]);
  });

  it("still rejects using the same file in two event galleries", async () => {
    const first = await seedEvent();
    const second = await seedEvent("source-media-show-2", "Source Media Show 2");
    const bytes = bytesOf("gallery-only-once");
    await publishPhoto(first.id, bytes, "live.jpg");

    const checksum = await sha256Hex(bytes);
    const begin = await app.request(
      "/api/uploads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: second.id,
          filename: "live-copy.jpg",
          mimeType: "image/jpeg",
          size: bytes.byteLength,
          title: "live-copy.jpg",
          checksum,
          purpose: "gallery",
        }),
      },
      env,
    );
    expect(begin.status).toBe(409);
  });

  it("reuses source media at complete when begin did not see a checksum", async () => {
    const first = await seedEvent();
    const second = await seedEvent("source-media-show-2", "Source Media Show 2");
    const bytes = bytesOf("complete-path-source-reuse");
    const { mediaId } = await publishPhoto(
      first.id,
      bytes,
      "fb-event.jpg",
      "source",
    );

    const begin = await app.request(
      "/api/uploads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: second.id,
          filename: "fb-event-copy.jpg",
          mimeType: "image/jpeg",
          size: bytes.byteLength,
          title: "fb-event-copy.jpg",
          purpose: "source",
        }),
      },
      env,
    );
    expect(begin.status).toBe(201);
    const beginBody = (await begin.json()) as ApiResponse<UploadBeginDTO>;
    expect(beginBody.data?.reused).toBe(false);
    const incomingId =
      beginBody.data && !beginBody.data.reused
        ? beginBody.data.mediaId
        : undefined;
    expect(incomingId).toBeDefined();
    expect(incomingId).not.toBe(mediaId);

    const put = await app.request(
      `/api/uploads/${incomingId}/body`,
      {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: bytes,
      },
      env,
    );
    expect(put.status).toBe(200);

    const complete = await app.request(
      `/api/uploads/${incomingId}/complete`,
      { method: "POST" },
      env,
    );
    expect(complete.status).toBe(200);
    const completeBody = (await complete.json()) as ApiResponse<MediaItemDTO>;
    expect(completeBody.data?.id).toBe(mediaId);

    const incoming = await getDb(env)
      .select({ status: media.status })
      .from(media)
      .where(eq(media.id, incomingId!))
      .get();
    expect(incoming?.status).toBe("failed");
  });
});
