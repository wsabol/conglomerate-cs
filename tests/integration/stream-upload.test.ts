import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { events, media, users } from "../../src/server/db/schema";
import type { ApiResponse } from "../../src/shared/types";
import type { MediaItemDTO } from "../../src/shared/dto";
import { createMockStreamBinding } from "../helpers/mockStream";

const MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

describe("video stream upload", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(media);
    await db.delete(events);
    await db.delete(users);

    await db.insert(users).values({
      id: 1,
      email: "dev@theconglomerate.local",
      role: "editor",
    });

    await db.insert(events).values({
      id: 1,
      slug: "test-event",
      name: "Test Event",
      eventType: "performance",
      datePrecision: "unknown",
      confidence: "medium",
    });

    env.STREAM = createMockStreamBinding() as typeof env.STREAM;
  });

  it("returns processing status after completing a video upload", async () => {
    const begin = await app.request(
      "/api/uploads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: 1,
          filename: "clip.mp4",
          mimeType: "video/mp4",
          size: MP4_BYTES.byteLength,
          title: "clip.mp4",
        }),
      },
      env,
    );
    expect(begin.status).toBe(201);
    const beginBody = (await begin.json()) as ApiResponse<{
      mediaId: number;
    }>;
    const mediaId = beginBody.data!.mediaId;

    const put = await app.request(
      `/api/uploads/${mediaId}/body`,
      {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: MP4_BYTES,
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
    expect(completeBody.data?.status).toBe("processing");
    expect(completeBody.data?.playable).toBe(false);
    expect(completeBody.data?.playbackUrl).toBeNull();
  });
});
