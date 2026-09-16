import { completeUpload } from "../../src/server/db/mutations/uploads";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { events, eventSources, eventPerformanceDetails, eventPeople, eventActs, people, media, users, objectRevisions, annotations } from "../../src/server/db/schema";
import { getEventConfidenceContext } from "../../src/server/db/queries";
import { commitConfidenceBatch, confidenceSnapshotGuard, confidenceStatementsForMedia, runConfidenceBackfill } from "../../src/server/db/mutations/confidence";
import { updateMediaWithConfidence } from "../../src/server/db/mutations/media-confidence";
import { softDeleteMedia } from "../../src/server/db/mutations/media";
import { applyStreamWebhookEvent } from "../../src/server/media/reconcile";
import type { EventDetailDTO } from "../../src/shared/dto";

const db = getDb(env);
const source = { sourceType: "url", url: "https://example.com/show" };
const second = { sourceType: "url", url: "https://example.com/post" };
const user = { id: 1, email: "dev@theconglomerate.local", role: "editor" as const, personId: null };
async function request(path: string, method = "GET", body?: unknown) {
  return app.request(path, { method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env);
}
async function create(extra: Record<string, unknown> = {}): Promise<EventDetailDTO> {
  const res = await request("/api/events", "POST", { name: "Show", eventDate: "2011-10-31", datePrecision: "exact", sources: [source], ...extra });
  expect(res.status).toBe(201);
  return (await res.json() as { data: EventDetailDTO }).data;
}
async function patch(event: EventDetailDTO, body: unknown): Promise<EventDetailDTO> {
  const res = await request(`/api/events/${event.id}`, "PATCH", body);
  expect(res.status).toBe(200);
  return (await res.json() as { data: EventDetailDTO }).data;
}
async function stored(id: number) { return (await db.select().from(events).where(eq(events.id, id)).get())!; }

beforeEach(async () => {
  await db.delete(annotations);
  await db.delete(eventPeople);
  await db.delete(eventActs);
  await db.delete(eventSources);
  await db.delete(eventPerformanceDetails);
  await db.delete(media);
  await db.delete(events);
  await db.delete(people);
  await db.delete(objectRevisions);
  await db.delete(users);
  await db.insert(users).values(user);
});

describe("confidence event writes", () => {
  it("ignores manual levels and agrees across storage, list, detail, and export", async () => {
    const event = await create({ sources: [source, second], confidence: "low" });
    expect(event.confidence).toBe("high");
    expect(event.confidenceAssessment.level).toBe("high");
    expect((await stored(event.id)).confidence).toBe("high");
    for (const path of ["/api/events", "/api/events?detailed=true"]) {
      const res = await request(path);
      const body = await res.json() as { data: { results: EventDetailDTO[] } };
      expect(body.data.results[0].confidence).toBe("high");
      if (path.includes("detailed")) expect(body.data.results[0].confidenceAssessment).toEqual(event.confidenceAssessment);
    }
    expect((await request(`/api/events/${event.id}`, "PATCH", { confidence: "low" })).status).toBe(400);
    expect((await patch(event, { summary: "Updated", confidence: "low" })).confidence).toBe("high");
  });

  it("merges partial performance edits and recalculates removals and date changes", async () => {
    let event = await create();
    expect(event.confidence).toBe("medium");
    event = await patch(event, { performance: { setlistText: "A song" } });
    expect(event.confidence).toBe("high");
    event = await patch(event, { performance: { billingName: "Band" } });
    expect(event.confidence).toBe("high");
    expect(event.performance?.setlistText).toBe("A song");
    event = await patch(event, { datePrecision: "month" });
    expect(event.confidence).toBe("medium");
    event = await patch(event, { datePrecision: "exact", eventDate: null });
    expect(event.confidence).toBe("medium");
    event = await patch(event, { eventDate: "2011-10-31", performance: { setlistText: null, promotionText: "Announcement" } });
    expect(event.confidence).toBe("high");
    event = await patch(event, { performance: { promotionText: " " } });
    expect(event.confidence).toBe("medium");
    event = await patch(event, { sources: [] });
    expect(event.confidence).toBe("low");
    expect((await stored(event.id)).confidence).toBe("low");
    const audit = await db.select().from(objectRevisions).where(eq(objectRevisions.targetType, "event")).orderBy(objectRevisions.id);
    expect(JSON.parse(audit.at(-1)!.afterJson!).confidence).toBe("low");
  });

  it("does not count memories or uncited media", async () => {
    const event = await create({ sources: [] });
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "I remember this show", authorId: 1 });
    await db.insert(media).values({ eventId: event.id, mediaType: "photo", status: "published", createdBy: 1 });
    expect((await patch(event, { summary: "Memory noted" })).confidence).toBe("low");
  });

  it("rolls back event, inline people, sources and score when the audit insert fails", async () => {
    const event = await create();
    const before = await stored(event.id);
    await db.run(sql`CREATE TRIGGER fail_confidence_audit BEFORE INSERT ON object_revisions
      WHEN NEW.target_type = 'event' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END`);
    try {
      const update = await request(`/api/events/${event.id}`, "PATCH", { name: "Changed", sources: [source, second], people: [{ displayName: "New person" }] });
      expect(update.status).toBe(500);
      expect(await stored(event.id)).toEqual(before);
      expect(await db.select().from(people)).toHaveLength(0);
      expect(await db.select().from(eventSources)).toHaveLength(1);
      const createResult = await request("/api/events", "POST", { name: "New show", sources: [source, second], people: [{ displayName: "Another person" }] });
      expect(createResult.status).toBe(500);
      expect(await db.select().from(events)).toHaveLength(1);
      expect(await db.select().from(people)).toHaveLength(0);
    } finally { await db.run(sql`DROP TRIGGER fail_confidence_audit`); }
  });

  it("rejects a stale snapshot without partially updating", async () => {
    const event = await create();
    const context = (await getEventConfidenceContext(db, event.id))!;
    await patch(event, { sources: [] });
    await expect(commitConfidenceBatch(db, [
      confidenceSnapshotGuard(db, context.expression, context.snapshot),
      db.update(events).set({ confidence: "high" }).where(eq(events.id, event.id)),
    ])).rejects.toMatchObject({ status: 409 });
    expect((await stored(event.id)).confidence).toBe("low");
  });

  it("does not treat unrelated malformed JSON as a stale snapshot", async () => {
    await expect(commitConfidenceBatch(db, [
      db.select({ checked: sql`json('{')` }).from(sql`(SELECT 1)`),
    ])).rejects.not.toMatchObject({ status: 409 });
  });

  it("links inline people to the inserted row, not a pre-existing namesake", async () => {
    const namesake = await db.insert(people).values({ displayName: "New person" }).returning().get();
    const event = await create({
      people: [
        { displayName: "New person", relationshipType: "performer" },
        { displayName: "new person", relationshipType: "organizer" },
      ],
    });
    const linked = await db.select().from(eventPeople).where(eq(eventPeople.eventId, event.id)).orderBy(eventPeople.id);
    expect(linked).toHaveLength(2);
    expect(linked[0].personId).toBe(linked[1].personId);
    expect(linked[0].personId).not.toBe(namesake.id);
    const created = await db.select().from(people).where(eq(people.id, linked[0].personId)).get();
    expect(created?.displayName).toBe("New person");
  });
});

describe("media eligibility and confidence", () => {
  it("recalculates on non-video upload completion and keeps repeated completion idempotent", async () => {
    const key = "confidence/source.pdf";
    await env.MEDIA.put(key, new TextEncoder().encode("A contemporary concert program"));
    await db.insert(media).values({ id: 1, mediaType: "document", mimeType: "application/pdf", r2Key: key, status: "uploading", createdBy: 1 });
    const event = await create({ sources: [source, { sourceType: "media", mediaId: 1 }] });
    await completeUpload(env, db, 1, user);
    expect((await stored(event.id)).confidence).toBe("high");
    const audits = await db.select().from(objectRevisions);
    await completeUpload(env, db, 1, user);
    expect(await db.select().from(objectRevisions)).toHaveLength(audits.length);
  });

  it("requires a published, non-deleted cited asset and recalculates every citing event", async () => {
    await db.insert(media).values({ id: 1, mediaType: "photo", status: "uploading", createdBy: 1 });
    const sources = [source, { sourceType: "media", mediaId: 1 }, { sourceType: "media", mediaId: 999 }];
    const a = await create({ sources });
    const b = await create({ name: "Second event", sources });
    expect(a.confidence).toBe("medium");
    await updateMediaWithConfidence(db, 1, { status: "published" }, 1);
    expect((await stored(a.id)).confidence).toBe("high");
    expect((await stored(b.id)).confidence).toBe("high");
    await softDeleteMedia(db, 1, user);
    expect((await stored(a.id)).confidence).toBe("medium");
    expect((await stored(b.id)).confidence).toBe("medium");
    const detail = await request(`/api/events/${a.slug}`);
    expect((await detail.json() as { data: EventDetailDTO }).data.confidenceAssessment.level).toBe("medium");
  });

  it("handles ready, duplicate ready, failed and ready-again Stream callbacks", async () => {
    await db.insert(media).values({ id: 1, mediaType: "video", status: "processing", streamUid: "confidence-video", createdBy: 1 });
    const event = await create({ sources: [source, { sourceType: "media", mediaId: 1 }] });
    const callback = { uid: "confidence-video", readyToStream: true, state: "ready", errorReasonCode: null, errorReasonText: null };
    await applyStreamWebhookEvent(db, callback);
    expect((await stored(event.id)).confidence).toBe("high");
    const audits = await db.select().from(objectRevisions).where(eq(objectRevisions.targetType, "event"));
    await applyStreamWebhookEvent(db, callback);
    expect(await db.select().from(objectRevisions).where(eq(objectRevisions.targetType, "event"))).toHaveLength(audits.length);
    await applyStreamWebhookEvent(db, { ...callback, readyToStream: false, state: "error", errorReasonCode: "ERR_ENCODING" });
    expect((await stored(event.id)).confidence).toBe("medium");
    await applyStreamWebhookEvent(db, callback);
    expect((await stored(event.id)).confidence).toBe("high");
  });

  it("rolls back media publication and event score if its audit fails", async () => {
    await db.insert(media).values({ id: 1, mediaType: "photo", status: "uploading", createdBy: 1 });
    const event = await create({ sources: [source, { sourceType: "media", mediaId: 1 }] });
    await db.run(sql`CREATE TRIGGER fail_media_audit BEFORE INSERT ON object_revisions
      WHEN NEW.target_type = 'media' BEGIN SELECT RAISE(ABORT, 'test media audit failure'); END`);
    try {
      await expect(updateMediaWithConfidence(db, 1, { status: "published" }, 1)).rejects.toThrow();
      expect((await stored(event.id)).confidence).toBe("medium");
      expect((await db.select().from(media).where(eq(media.id, 1)).get())!.status).toBe("uploading");
    } finally { await db.run(sql`DROP TRIGGER fail_media_audit`); }
  });

  it("does not audit unpublished processing-state updates", async () => {
    await db.insert(media).values({ id: 1, mediaType: "video", status: "processing", createdBy: 1 });
    const before = await db.select().from(objectRevisions);
    await updateMediaWithConfidence(db, 1, { status: "failed" });
    expect((await db.select().from(media).where(eq(media.id, 1)).get())!.status).toBe("failed");
    expect(await db.select().from(objectRevisions)).toHaveLength(before.length);
  });

  it("rejects evidence changes between preparing and publishing media", async () => {
    await db.insert(media).values({ id: 1, mediaType: "photo", status: "uploading", createdBy: 1 });
    const event = await create({ sources: [source, { sourceType: "media", mediaId: 1 }] });
    const statements = await confidenceStatementsForMedia(db, 1, true, null);
    await patch(event, { sources: [] });
    await expect(commitConfidenceBatch(db, [statements[0], ...statements.slice(1),
      db.update(media).set({ status: "published" }).where(eq(media.id, 1))])).rejects.toMatchObject({ status: 409 });
    expect((await stored(event.id)).confidence).toBe("low");
  });
});

describe("confidence backfill", () => {
  it("requires an editor even for dry-run", async () => {
    const response = await app.request("/api/admin/events/confidence-backfill", {
      method: "POST", headers: { "Cf-Access-Authenticated-User-Email": "viewer@example.com" },
    }, env);
    expect(response.status).toBe(401);
    await db.insert(users).values({ email: "viewer@example.com", role: "member" });
    const member = await app.request("/api/admin/events/confidence-backfill", {
      method: "POST", headers: { "Cf-Access-Authenticated-User-Email": "viewer@example.com" },
    }, env);
    expect(member.status).toBe(403);
  });

  it("defaults to dry-run, applies with system revisions, preserves timestamps and is idempotent", async () => {
    const event = await create();
    await db.update(events).set({ confidence: "high", modifiedOn: "2000-01-01 00:00:00" }).where(eq(events.id, event.id));
    const response = await request("/api/admin/events/confidence-backfill", "POST");
    expect(response.status).toBe(200);
    expect((await stored(event.id)).confidence).toBe("high");
    const result = await runConfidenceBackfill(db, { dry_run: false, after_id: 0, limit: 25 });
    expect(result.results[0]).toMatchObject({ previousLevel: "high", changed: true, assessment: { level: "medium" } });
    expect((await stored(event.id)).modifiedOn).toBe("2000-01-01 00:00:00");
    const audits = await db.select().from(objectRevisions).orderBy(objectRevisions.id);
    expect(audits.at(-1)!.changedBy).toBeNull();
    const again = await runConfidenceBackfill(db, { dry_run: false, after_id: 0, limit: 25 });
    expect(again.results[0].changed).toBe(false);
    expect(await db.select().from(objectRevisions)).toHaveLength(audits.length);
  });

  it("paginates by ID and excludes deleted events", async () => {
    const a = await create();
    const b = await create({ name: "Other" });
    await create({ name: "Deleted" }).then((event) => db.update(events).set({ isDeleted: true }).where(eq(events.id, event.id)));
    const page = await runConfidenceBackfill(db, { dry_run: true, after_id: 0, limit: 1 });
    expect(page.results.map((r) => r.eventId)).toEqual([a.id]);
    const next = await runConfidenceBackfill(db, { dry_run: true, after_id: page.nextAfterId!, limit: 25 });
    expect(next.results.map((r) => r.eventId)).toEqual([b.id]);
    expect(next.nextAfterId).toBeNull();
    expect((await request("/api/admin/events/confidence-backfill?limit=100000", "POST")).status).toBe(400);
  });
});
