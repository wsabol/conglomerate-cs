import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  eventPerformanceDetails,
  events,
  media,
  users,
} from "../../src/server/db/schema";
import { sha256Hex } from "../../src/shared/checksum";
import type { ApiResponse, ApiErrorDetail } from "../../src/shared/types";
import type { MediaItemDTO } from "../../src/shared/dto";

interface UploadTarget {
  mediaId: number;
  uploadUrl: string;
  uploadMethod: "PUT";
  directUpload: boolean;
}

async function seedEvents() {
  const db = getDb(env);
  const a = await db
    .insert(events)
    .values({
      slug: "show-a-2011-05-14",
      name: "Show A",
      eventType: "performance",
      eventDate: "2011-05-14",
      datePrecision: "exact",
      confidence: "high",
    })
    .returning()
    .get();
  const b = await db
    .insert(events)
    .values({
      slug: "show-b-2012-06-01",
      name: "Show B",
      eventType: "performance",
      eventDate: "2012-06-01",
      datePrecision: "exact",
      confidence: "high",
    })
    .returning()
    .get();
  await db.insert(eventPerformanceDetails).values({
    eventId: a.id,
    billingName: "Spring 2011 @ The Fillmore",
  });
  await db.insert(eventPerformanceDetails).values({ eventId: b.id });
  return { eventA: a, eventB: b };
}

async function beginUpload(
  eventId: number,
  filename: string,
  mimeType: string,
  size: number,
  checksum?: string,
) {
  const res = await app.request(
    "/api/uploads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        filename,
        mimeType,
        size,
        title: filename,
        ...(checksum ? { checksum } : {}),
      }),
    },
    env,
  );
  const body = (await res.json()) as ApiResponse<UploadTarget> & {
    data?: { details?: ApiErrorDetail[] };
  };
  return { res, body };
}

async function putBody(mediaId: number, bytes: ArrayBuffer, mimeType: string) {
  return app.request(
    `/api/uploads/${mediaId}/body`,
    {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: bytes,
    },
    env,
  );
}

async function completeUpload(mediaId: number) {
  const res = await app.request(
    `/api/uploads/${mediaId}/complete`,
    { method: "POST" },
    env,
  );
  const body = (await res.json()) as ApiResponse<MediaItemDTO> & {
    data?: { details?: ApiErrorDetail[] };
  };
  return { res, body };
}

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function publishFile(
  eventId: number,
  bytes: ArrayBuffer,
  filename: string,
  mimeType: string,
) {
  const checksum = await sha256Hex(bytes);
  const { res: beginRes, body: beginBody } = await beginUpload(
    eventId,
    filename,
    mimeType,
    bytes.byteLength,
    checksum,
  );
  expect(beginRes.status).toBe(201);
  const mediaId = beginBody.data!.mediaId;
  const putRes = await putBody(mediaId, bytes, mimeType);
  expect(putRes.status).toBe(200);
  const { res: completeRes, body: completeBody } = await completeUpload(mediaId);
  expect(completeRes.status).toBe(200);
  return { mediaId, checksum, dto: completeBody.data! };
}

describe("media upload dedup", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(media);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
    await db.delete(users);
  });

  it("rejects beginUpload when checksum already exists", async () => {
    const { eventA, eventB } = await seedEvents();
    const bytes = bytesOf("identical-photo-bytes");
    const { checksum } = await publishFile(
      eventA.id,
      bytes,
      "shot.jpg",
      "image/jpeg",
    );

    const { res, body } = await beginUpload(
      eventB.id,
      "copy.jpg",
      "image/jpeg",
      bytes.byteLength,
      checksum,
    );

    expect(res.status).toBe(409);
    expect(body.message).toBe("This file already exists in the archive.");
    const details = (body.data as { details?: ApiErrorDetail[] } | null)
      ?.details;
    expect(details?.[0]?.error_code).toBe("duplicate_media");
    expect(details?.[0]?.message).toContain("Spring 2011 @ The Fillmore");

    const rows = await getDb(env).select().from(media);
    expect(rows.filter((r) => r.status === "uploading")).toHaveLength(0);
    expect(rows.filter((r) => r.status === "published")).toHaveLength(1);
  });

  it("rejects completeUpload when bytes match an existing checksum", async () => {
    const { eventA, eventB } = await seedEvents();
    const bytes = bytesOf("complete-path-dup");
    await publishFile(eventA.id, bytes, "orig.jpg", "image/jpeg");

    // Omit checksum so begin succeeds; authoritative check is at complete.
    const { res: beginRes, body: beginBody } = await beginUpload(
      eventB.id,
      "dup.jpg",
      "image/jpeg",
      bytes.byteLength,
    );
    expect(beginRes.status).toBe(201);
    const mediaId = beginBody.data!.mediaId;

    const putRes = await putBody(mediaId, bytes, "image/jpeg");
    expect(putRes.status).toBe(200);

    const { res, body } = await completeUpload(mediaId);
    expect(res.status).toBe(409);
    expect(body.message).toBe("This file already exists in the archive.");
    const details = (body.data as { details?: ApiErrorDetail[] } | null)
      ?.details;
    expect(details?.[0]?.error_code).toBe("duplicate_media");

    const row = await getDb(env)
      .select()
      .from(media)
      .where(eq(media.id, mediaId))
      .get();
    expect(row?.status).toBe("failed");

    // Orphan R2 object should be cleaned up.
    expect(row?.r2Key).toBeTruthy();
    const orphan = await env.MEDIA.get(row!.r2Key!);
    expect(orphan).toBeNull();
  });

  it("allows re-upload after the original is soft-deleted", async () => {
    const { eventA, eventB } = await seedEvents();
    const bytes = bytesOf("soft-delete-reupload");
    const { mediaId } = await publishFile(
      eventA.id,
      bytes,
      "gone.jpg",
      "image/jpeg",
    );

    await getDb(env)
      .update(media)
      .set({ isDeleted: true })
      .where(eq(media.id, mediaId));

    const again = await publishFile(
      eventB.id,
      bytes,
      "back.jpg",
      "image/jpeg",
    );
    expect(again.dto.id).not.toBe(mediaId);
    expect(again.dto.status).toBe("published");
  });

  it("publishes two different files successfully", async () => {
    const { eventA } = await seedEvents();
    const a = bytesOf("file-one");
    const b = bytesOf("file-two");

    const first = await publishFile(eventA.id, a, "one.jpg", "image/jpeg");
    const second = await publishFile(eventA.id, b, "two.jpg", "image/jpeg");

    expect(first.dto.id).not.toBe(second.dto.id);
    expect(first.checksum).not.toBe(second.checksum);
  });
});
