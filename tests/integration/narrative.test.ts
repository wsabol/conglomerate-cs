import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client";
import { app } from "../../src/server/app";
import { annotations, eventActs, eventPeople, eventPerformanceDetails, eventSources, events, media, narrativeJobs, objectRevisions, people, places } from "../../src/server/db/schema";
import { annotationCreateSchema, annotationUpdateSchema } from "../../src/shared/schemas/annotation";
import { invalidateAround, publicNarrativeJob, relatedEventIds } from "../../src/server/narrative/jobs";
import { processDueNarratives, processNarrative } from "../../src/server/narrative/worker";
import { updateEventBySlug } from "../../src/server/db/mutations/events";
import { draftEvidence } from "../../src/server/narrative/draft";
import type { Env } from "../../src/server/env";

function aiEnv(run: NonNullable<Env["AI"]>["run"]): Env {
  return { ...env, NARRATIVES_ENABLED: "true", AI: { run } } as unknown as Env;
}

describe("living narratives", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(annotations);
    await db.delete(eventSources);
    await db.delete(eventPeople);
    await db.delete(eventActs);
    await db.delete(media);
    await db.delete(narrativeJobs);
    await db.delete(eventPerformanceDetails);
    await db.delete(events);
    await db.delete(people);
    await db.delete(places);
  });

  it("uses only exact related events within three days", async () => {
    const db = getDb(env);
    const place = await db.insert(places).values({ name: "The Room" }).returning().get();
    const rows = await db.insert(events).values([
      { slug: "focal", name: "Focal", eventDate: "2011-05-14", datePrecision: "exact", placeId: place.id },
      { slug: "three", name: "Three", eventDate: "2011-05-17", datePrecision: "exact", placeId: place.id },
      { slug: "four", name: "Four", eventDate: "2011-05-18", datePrecision: "exact", placeId: place.id },
      { slug: "imprecise", name: "Imprecise", eventDate: "2011-05-15", datePrecision: "approximate", placeId: place.id },
    ]).returning();
    expect(await relatedEventIds(db, rows[0].id)).toEqual([rows[0].id, rows[1].id]);
  });

  it("opening an event and polling its status do not run or requeue generation", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "read-only", name: "Read Only", summary: "Stable prose." }).returning().get();
    await invalidateAround(db, event.id);
    const initial = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
    let calls = 0;
    const enabled = aiEnv(async () => { calls++; return { response: "Unexpected rewrite." }; });

    for (let visit = 0; visit < 2; visit++) {
      expect((await app.request(`/api/events/${event.slug}`, { method: "GET" }, enabled)).status).toBe(200);
      expect((await app.request(`/api/events/${event.slug}/summary-status`, { method: "GET" }, enabled)).status).toBe(200);
    }

    const after = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
    expect(calls).toBe(0);
    expect(after?.requestedVersion).toBe(initial?.requestedVersion);
    expect(after?.status).toBe(initial?.status);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("Stable prose.");
  });

  it("does not queue a new event with no memories for a summary rewrite", async () => {
    const created = await app.request("/api/events", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Archive Entry", summary: "An editor's first account." }),
    }, env);
    expect(created.status).toBe(201);
    const db = getDb(env);
    const event = await db.select().from(events).where(eq(events.name, "New Archive Entry")).get();
    expect(event?.summary).toBe("An editor's first account.");
    expect(await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event!.id))).toHaveLength(0);
  });

  it.each(["pending", "expired", "abandoned"])("recovers %s work after a long generation pause", async (state) => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "old-queue", name: "Old Queue", summary: "Original account." }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id,
      body: "We played an encore.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    await db.update(narrativeJobs).set({ modifiedOn: "2000-01-01 00:00:00",
      status: state === "expired" ? "failed" : state === "abandoned" ? "processing" : "pending",
      errorCode: state === "expired" ? "QUEUE_EXPIRED" : null,
      leaseToken: state === "abandoned" ? "dead-worker" : null,
      leaseUntil: state === "abandoned" ? "2000-01-01T00:03:00.000Z" : null,
    }).where(eq(narrativeJobs.eventId, event.id));
    const stale = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
    expect(publicNarrativeJob(stale)?.errorCode).toBe(state === "abandoned" ? "LEASE_EXPIRED" : state === "expired" ? "QUEUE_EXPIRED" : null);
    let calls = 0;
    const enabled = aiEnv(async () => { calls++; return { response: "The band played an encore." }; });
    const statusResponse = await app.request(`/api/events/${event.slug}/summary-status`, {}, enabled);
    const statusBody = await statusResponse.json() as { data: { job: ReturnType<typeof publicNarrativeJob> } };
    expect(statusBody.data.job).toEqual(publicNarrativeJob(stale));
    expect(statusBody.data.job).not.toHaveProperty("leaseToken");
    expect(statusBody.data.job).not.toHaveProperty("leaseUntil");
    await processDueNarratives({ ...enabled, NARRATIVES_ENABLED: "false" });
    expect(calls).toBe(0);
    expect((await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get())?.status).toBe(stale?.status);
    await processDueNarratives(enabled);
    expect(calls).toBe(1);
    const completed = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
    expect(completed?.status).toBe("complete");
    expect(completed?.requestedVersion).toBe(stale?.requestedVersion);
    expect(completed?.completedVersion).toBe(completed?.requestedVersion);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("The band played an encore.");
  });

  it("preserves the current summary without AI when only promotion and event metadata exist", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "human-copy", name: "Human Copy", summary: "The editor's exact copy: contact me@example.com" }).returning().get();
    await db.insert(eventPerformanceDetails).values({ eventId: event.id, promotionText: "An advertised party." });
    await invalidateAround(db, event.id);
    let calls = 0;
    expect(await processNarrative(aiEnv(async () => { calls++; return { response: "Unwanted AI text" }; }), event.id, 25_000)).toBe(true);
    expect(calls).toBe(0);
    const saved = await db.select().from(events).where(eq(events.id, event.id)).get();
    expect(saved?.summary).toBe("The editor's exact copy: contact me@example.com");
  });

  it("generates a read-only editor draft from unsaved fields without memories", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "draft-only", name: "Saved Name", summary: "OLD SUMMARY SECRET" }).returning().get();
    await db.insert(eventSources).values({ eventId: event.id, sourceType: "text", description: "An archival program lists the show.", url: "https://example.com/not-fetched" });
    const before = await draftEvidence(db, event.id);
    let prompt = "";
    const response = await app.request(`/api/events/${event.slug}/summary-draft`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unsaved Name", eventType: "performance", datePrecision: "year", eventDate: "2012-01-01",
        performance: { promotionText: "Advertised for the weekend.", billingName: "The Billed Band" } }),
    }, { ...aiEnv(async (_model, input) => {
      prompt = input.messages[1].content;
      return { response: "An archival program lists Unsaved Name in 2012." };
    }), NARRATIVES_ENABLED: "false" });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { data: { summary: string; basis: string } };
    expect(result.data.summary).toContain("Unsaved Name");
    expect(result.data.basis).toBe(before.basis);
    expect(prompt).toContain("Unsaved Name");
    expect(prompt).toContain("An archival program lists the show.");
    expect(prompt).toContain("Advertised for the weekend.");
    expect(prompt).not.toContain("OLD SUMMARY SECRET");
    expect(prompt).not.toContain("https://example.com/not-fetched");
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("OLD SUMMARY SECRET");
    expect(await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id))).toHaveLength(0);
    expect(await db.select().from(objectRevisions).where(eq(objectRevisions.targetId, event.id))).toHaveLength(0);
  });

  it("restricts draft generation to editors and leaves state unchanged on AI failure", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "draft-access", name: "Draft Access", summary: "Saved copy." }).returning().get();
    const body = JSON.stringify({ name: event.name, eventType: "performance", datePrecision: "exact" });
    const member = await app.request(`/api/events/${event.slug}/summary-draft`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }, { ...aiEnv(async () => ({ response: "Forbidden" })), DEV_USER_ROLE: "member" });
    expect(member.status).toBe(403);
    const failure = await app.request(`/api/events/${event.slug}/summary-draft`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }, aiEnv(async () => { throw new Error("provider unavailable"); }));
    expect(failure.status).toBe(502);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("Saved copy.");
    expect(await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id))).toHaveLength(0);
  });

  it("saves an editor draft as the baseline, supersedes pending work, and edits later memories incrementally", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "draft-save", name: "Draft Save", summary: "Old account." }).returning().get();
    const memory = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "A first recollection.", incorporatePref: "yes" }).returning().get();
    await invalidateAround(db, event.id);
    const draft = await app.request(`/api/events/${event.slug}/summary-draft`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: event.name, eventType: "performance", datePrecision: "exact" }),
    }, aiEnv(async (_model, input) => {
      expect(input.messages[1].content).toContain("A first recollection.");
      return { response: "Fresh draft." };
    }));
    const { basis } = ((await draft.json()) as { data: { basis: string } }).data;
    await updateEventBySlug(db, event.slug, { name: "Revised Name", summary: "Fresh edited draft.", summaryDraftBasis: basis }, 0);
    const job = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
    expect(job?.status).toBe("complete");
    expect(job?.hasGeneratedSummary).toBe(true);
    expect(job?.requestedVersion).toBe(job?.completedVersion);
    expect(JSON.parse(job!.sourceSnapshot).map((item: { id: number }) => item.id)).toEqual([memory.id]);
    expect((await db.select().from(annotations).where(eq(annotations.id, memory.id)).get())?.summaryStatus).toBe("incorporated");
    const next = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "Another memory.", incorporatePref: "yes" }).returning().get();
    await invalidateAround(db, event.id);
    await processNarrative(aiEnv(async (_model, input) => {
      expect(input.messages[0].content).toContain("Incrementally edit");
      expect(JSON.parse(input.messages[1].content).changes.added[0].id).toBe(next.id);
      return { response: "Fresh edited draft. Another memory." };
    }), event.id, 25_000);
  });

  it("uses a saved memory-free draft as the baseline for the first later memory", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "draft-first-memory", name: "Draft First Memory" }).returning().get();
    const { basis } = await draftEvidence(db, event.id);
    await updateEventBySlug(db, event.slug, { summary: "A cautious metadata-based draft.", summaryDraftBasis: basis }, 0);
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "We arrived late.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    await processNarrative(aiEnv(async (_model, input) => {
      expect(input.messages[0].content).toContain("Incrementally edit");
      expect(JSON.parse(input.messages[1].content).currentNarrative).toBe("A cautious metadata-based draft.");
      return { response: "A cautious metadata-based draft. The band arrived late." };
    }), event.id, 25_000);
  });

  it("rejects a generated draft after saved evidence changes", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "draft-stale", name: "Draft Stale" }).returning().get();
    const { basis } = await draftEvidence(db, event.id);
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "New evidence", incorporatePref: "yes" });
    await expect(updateEventBySlug(db, event.slug, { summary: "Stale draft.", summaryDraftBasis: basis }, 0)).rejects.toThrow(/evidence changed/);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBeNull();
  });

  it("keeps the first memory on the full-write path after a no-memory job completes", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "first-after-empty", name: "First After Empty" }).returning().get();
    await invalidateAround(db, event.id);
    await processNarrative(aiEnv(async () => { throw new Error("AI should not run without memories"); }), event.id, 25_000);
    expect((await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get())?.hasGeneratedSummary).toBe(false);
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "The first memory.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    await processNarrative(aiEnv(async (_model, input) => {
      expect(input.messages[0].content).toContain("Write a connected third-person archival narrative");
      return { response: "The first memory describes the event." };
    }), event.id, 25_000);
  });

  it("accepts legacy no_pref records for reading but only yes/separate for new writes", () => {
    expect(annotationCreateSchema.safeParse({ targetType: "event", targetId: 1, body: "Memory" }).data?.incorporatePref).toBe("yes");
    expect(annotationCreateSchema.safeParse({ targetType: "event", targetId: 1, body: "Memory", incorporatePref: "no_pref" }).success).toBe(false);
    expect(annotationUpdateSchema.safeParse({ incorporatePref: "no_pref" }).success).toBe(false);
  });

  it("includes same-day nearby events with name, place, and billed acts only", async () => {
    const db = getDb(env);
    const place = await db.insert(places).values({ name: "The Room" }).returning().get();
    const otherPlace = await db.insert(places).values({ name: "The Hall" }).returning().get();
    const [focal, nearby] = await db.insert(events).values([
      { slug: "focal-night", name: "Focal Night", eventDate: "2011-05-14", datePrecision: "exact", placeId: place.id, summary: "The focal editorial." },
      { slug: "other-bill", name: "Other Bill", eventDate: "2011-05-14", datePrecision: "exact", placeId: otherPlace.id, summary: "FORBIDDEN NEARBY EDITORIAL" },
      { slug: "next-night", name: "Next Night", eventDate: "2011-05-15", datePrecision: "exact", placeId: place.id, summary: "FORBIDDEN NEXT DAY" },
    ]).returning();
    await db.insert(eventActs).values({ eventId: nearby.id, name: "Opening Act" });
    await db.insert(annotations).values([
      { targetType: "event", targetId: focal.id, body: "We played until sunrise.", incorporatePref: "yes" },
      { targetType: "event", targetId: nearby.id, body: "FORBIDDEN NEARBY MEMORY", incorporatePref: "yes" },
    ]);
    await invalidateAround(db, focal.id);
    let prompt = "";
    await processNarrative(aiEnv(async (_model, input) => { prompt = input.messages[1].content; return { response: "The band played until sunrise." }; }), focal.id, 25_000);
    expect(prompt).toContain("Other Bill");
    expect(prompt).toContain("The Hall");
    expect(prompt).toContain("Opening Act");
    expect(prompt).toContain('"role":"nearby"');
    for (const forbidden of ["FORBIDDEN NEARBY EDITORIAL", "FORBIDDEN NEARBY MEMORY", "Next Night", "FORBIDDEN NEXT DAY"]) expect(prompt).not.toContain(forbidden);
  });

  it("sends only whitelisted facts with precise date labels and redacts sensitive text", async () => {
    const db = getDb(env);
    const place = await db.insert(places).values({ name: "The Room" }).returning().get();
    const person = await db.insert(people).values({ displayName: "Real Name" }).returning().get();
    const event = await db.insert(events).values({ slug: "allowlist", name: "Allowlist", eventDate: "2011-05-01", datePrecision: "month", placeId: place.id, summary: "An important rehearsal." }).returning().get();
    await db.insert(eventPeople).values({ eventId: event.id, personId: person.id, relationshipType: "performer" });
    await db.insert(eventActs).values({ eventId: event.id, name: "The Act" });
    await db.insert(eventPerformanceDetails).values({ eventId: event.id, promotionText: "Advertised for local fans.", setlistText: "FORBIDDEN SETLIST" });
    await db.insert(eventSources).values({ eventId: event.id, sourceType: "url", url: "https://secret.example/source", description: "FORBIDDEN SOURCE" });
    await db.insert(media).values({ eventId: event.id, mediaType: "link", status: "published", externalUrl: "https://secret.example/media", description: "FORBIDDEN MEDIA" });
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "@[Wrong Name](" + person.id + ") spoke to me@example.com; api_key=SECRET123 at https://secret.example/recording", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    let prompt = "";
    await processNarrative(aiEnv(async (_model, input) => { prompt = input.messages[1].content; return { response: "The rehearsal brought the group together." }; }), event.id, 25_000);
    expect(prompt).toContain("May 2011");
    expect(prompt).toContain("The Room");
    expect(prompt).toContain("The Act");
    expect(prompt).toContain("Real Name");
    for (const forbidden of ["2011-05-01", "Wrong Name", "me@example.com", "SECRET123", "secret.example", "FORBIDDEN SETLIST", "FORBIDDEN SOURCE", "FORBIDDEN MEDIA"]) expect(prompt).not.toContain(forbidden);
  });

  it("bounds each model input when long eligible memories require chunking", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "long-story", name: "Long Story", summary: "A long night." }).returning().get();
    await db.insert(annotations).values([1, 2, 3].map((n) => ({ targetType: "event" as const, targetId: event.id, body: `Memory ${n}: ${"rain and music. ".repeat(550)}`, incorporatePref: "yes" as const })));
    await invalidateAround(db, event.id);
    const sizes: number[] = [];
    const result = await processNarrative(aiEnv(async (_model, input) => { sizes.push(new TextEncoder().encode(input.messages[1].content).length); return { response: "The band played through the rain." }; }), event.id, 25_000);
    expect(result).toBe(true);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(16_000);
  });

  it("uses the current summary and advertised context and records incorporated revisions", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "story", name: "Story", summary: "An early show." }).returning().get();
    await db.insert(eventPerformanceDetails).values({ eventId: event.id, promotionText: "Advertised as an all-night party." });
    const memory = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "We loaded in after dinner.", incorporatePref: "yes" }).returning().get();
    await invalidateAround(db, event.id);
    let prompt = "";
    const result = await processNarrative(aiEnv(async (_model, input) => {
      prompt = input.messages[1].content;
      return { response: "After dinner, the band loaded in for the show." };
    }), event.id, 25_000);
    expect(result).toBe(true);
    expect(prompt).toContain("An early show.");
    expect(prompt).toContain("Advertised as an all-night party.");
    expect(prompt).toContain("We loaded in after dinner.");
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("After dinner, the band loaded in for the show.");
    const processed = await db.select().from(annotations).where(eq(annotations.id, memory.id)).get();
    expect(processed?.summaryStatus).toBe("incorporated");
    expect(processed?.processedRevision).toBe(processed?.inputRevision);
  });

  it("discards generated prose when inputs change during inference", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "changing", name: "Changing", summary: "Original" }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "First version", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    const result = await processNarrative(aiEnv(async () => {
      await invalidateAround(db, event.id);
      return { response: "Obsolete version" };
    }), event.id, 25_000);
    expect(result).toBe(false);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("Original");
    expect((await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get())?.status).toBe("pending");
  });

  it("uses linked media memories and removes excluded memories on rebuild", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "media-story", name: "Media Story", summary: "The show began late." }).returning().get();
    const photo = await db.insert(media).values({ eventId: event.id, mediaType: "photo", status: "published" }).returning().get();
    const included = await db.insert(annotations).values({ targetType: "media", targetId: photo.id, body: "We waited outside in the rain.", incorporatePref: "yes" }).returning().get();
    const legacy = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "Legacy recollection.", incorporatePref: "no_pref" }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "Private detail", incorporatePref: "separate", summaryStatus: "excluded" });
    await invalidateAround(db, event.id);
    const prompts: string[] = [];
    const fake = aiEnv(async (_model, input) => { prompts.push(input.messages[1].content); return { response: prompts.length === 1 ? "The audience waited in the rain before the late show." : "The show began late." }; });
    expect(await processNarrative(fake, event.id, 25_000)).toBe(true);
    expect(prompts[0]).toContain("We waited outside in the rain.");
    expect(prompts[0]).toContain("Legacy recollection.");
    expect(prompts[0]).not.toContain("Private detail");
    await db.update(annotations).set({ incorporatePref: "separate", summaryStatus: "excluded", inputRevision: 2 }).where(eq(annotations.id, included.id));
    await db.update(annotations).set({ incorporatePref: "separate", summaryStatus: "excluded", inputRevision: 2 }).where(eq(annotations.id, legacy.id));
    await invalidateAround(db, event.id);
    expect(await processNarrative(fake, event.id, 25_000)).toBe(true);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("The show began late.");
  });

  it("keeps the last narrative and retries a failed AI call", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "retry-story", name: "Retry Story", summary: "Existing text" }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "The amp failed.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    expect(await processNarrative(aiEnv(async () => { throw new Error("provider unavailable"); }), event.id, 25_000)).toBe(false);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("Existing text");
    const failed = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
    expect(failed?.status).toBe("failed");
    expect(failed?.nextRetryOn).toBeTruthy();
    await db.update(narrativeJobs).set({ nextRetryOn: "2000-01-01T00:00:00.000Z" }).where(eq(narrativeJobs.eventId, event.id));
    expect(await processNarrative(aiEnv(async () => ({ response: "The amp failed during the show." })), event.id, 25_000)).toBe(true);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("The amp failed during the show.");
  });

  it("writes a full narrative the first time, then edits incrementally", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "first-write", name: "First Write", summary: "A short human note." }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "We arrived late.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    let first: { system: string; user: string } | undefined;
    await processNarrative(aiEnv(async (_model, input) => {
      first = { system: input.messages[0].content, user: input.messages[1].content };
      return { response: "The band arrived late." };
    }), event.id, 25_000);
    expect(first?.system).toContain("Write a connected third-person archival narrative");
    expect(first?.system).not.toContain("Do not rewrite the story");
    expect(JSON.parse(first!.user).existingSummary).toBe("A short human note.");
    expect(JSON.parse(first!.user).changes).toBeUndefined();
    const added = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "The amplifier broke.", incorporatePref: "yes" }).returning().get();
    await invalidateAround(db, event.id);
    let second: { system: string; user: string } | undefined;
    await processNarrative(aiEnv(async (_model, input) => {
      second = { system: input.messages[0].content, user: input.messages[1].content };
      return { response: "The band arrived late. The amplifier broke." };
    }), event.id, 25_000);
    expect(second?.system).toContain("Do not rewrite the story");
    const payload = JSON.parse(second!.user);
    expect(payload.currentNarrative).toBe("The band arrived late.");
    expect(payload.changes.added.map((m: { id: number }) => m.id)).toEqual([added.id]);
  });

  it("uses editor changes as the next editing target and continues automatic updates", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "editable", name: "Editable", summary: "Original prose." }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "We arrived late.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    await processNarrative(aiEnv(async () => ({ response: "Original prose. We arrived late." })), event.id, 25_000);
    await updateEventBySlug(db, event.slug, { summary: "The editor's chosen opening. We arrived late." }, 0);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("The editor's chosen opening. We arrived late.");
    const added = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "The amplifier broke.", incorporatePref: "yes" }).returning().get();
    await invalidateAround(db, event.id);
    let payload: any;
    const result = await processNarrative(aiEnv(async (_model, input) => {
      payload = JSON.parse(input.messages[1].content);
      expect(input.messages[0].content).toContain("Do not rewrite the story");
      return { response: "The editor's chosen opening. We arrived late. The amplifier broke." };
    }), event.id, 25_000);
    expect(result).toBe(true);
    expect(payload.currentNarrative).toBe("The editor's chosen opening. We arrived late.");
    expect(payload.changes.added.map((m: { id: number }) => m.id)).toEqual([added.id]);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toContain("The amplifier broke.");
  });

  it("retries against a human edit made during inference without saving a stale revision", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "race", name: "Race", summary: "Old wording." }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "An encore.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    expect(await processNarrative(aiEnv(async () => {
      await updateEventBySlug(db, event.slug, { summary: "Human correction." }, 0);
      return { response: "Stale AI wording." };
    }), event.id, 25_000)).toBe(false);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("Human correction.");
    const revisions = await db.select().from(objectRevisions).where(eq(objectRevisions.targetId, event.id));
    expect(revisions.some((r) => r.afterJson?.includes("Stale AI wording."))).toBe(false);
    expect(await processNarrative(aiEnv(async (_model, input) => {
      expect(input.messages[0].content).toContain("Write a connected third-person archival narrative");
      expect(JSON.parse(input.messages[1].content).existingSummary).toBe("Human correction.");
      return { response: "Human correction. An encore followed." };
    }), event.id, 25_000)).toBe(true);
  });

  it("keeps exact prose and avoids audit churn for a no-change response", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "no-change", name: "No Change", summary: "Exact prose.\n\nSecond paragraph.", modifiedOn: "2001-01-01 00:00:00" }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "Great night!", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    const prior = await db.select().from(objectRevisions);
    expect(await processNarrative(aiEnv(async () => ({ response: "NO_CHANGE" })), event.id, 25_000)).toBe(true);
    const saved = await db.select().from(events).where(eq(events.id, event.id)).get();
    expect(saved?.summary).toBe(event.summary);
    expect(saved?.modifiedOn).toBe(event.modifiedOn);
    expect(await db.select().from(objectRevisions)).toHaveLength(prior.length);
    expect((await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get())?.status).toBe("complete");
  });

  it("identifies changed evidence and retracts the last deleted memory", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "correction", name: "Correction" }).returning().get();
    const memory = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "We played Friday.", incorporatePref: "yes" }).returning().get();
    await invalidateAround(db, event.id);
    await processNarrative(aiEnv(async () => ({ response: "The band played Friday." })), event.id, 25_000);
    await db.update(annotations).set({ body: "We played Saturday.", inputRevision: 2, summaryStatus: "pending" }).where(eq(annotations.id, memory.id));
    await invalidateAround(db, event.id);
    expect(await processNarrative(aiEnv(async (_model, input) => {
      const payload = JSON.parse(input.messages[1].content);
      expect(payload.changes.changed[0].before.text).toBe("We played Friday.");
      expect(payload.changes.changed[0].after.text).toBe("We played Saturday.");
      return { response: "The band played Saturday." };
    }), event.id, 25_000)).toBe(true);
    await db.update(annotations).set({ isDeleted: true, inputRevision: 3, summaryStatus: "excluded" }).where(eq(annotations.id, memory.id));
    await invalidateAround(db, event.id);
    expect(await processNarrative(aiEnv(async (_model, input) => {
      const payload = JSON.parse(input.messages[1].content);
      expect(payload.evidence[0].memories).toEqual([]);
      expect(payload.changes.removed[0].text).toBe("We played Saturday.");
      return { response: "EMPTY_SUMMARY" };
    }), event.id, 25_000)).toBe(true);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBeNull();
    expect((await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get())?.sourceSnapshot).toBe("[]");
  });

  it("preserves the complete editing target when evidence must be condensed", async () => {
    const db = getDb(env);
    const summary = "An editor's carefully worded paragraph. ".repeat(450);
    const event = await db.insert(events).values({ slug: "long-edit", name: "Long Edit", summary }).returning().get();
    await db.insert(annotations).values([1, 2, 3].map((n) => ({ targetType: "event" as const, targetId: event.id, body: `Memory ${n}: ${"rain and music. ".repeat(550)}`, incorporatePref: "yes" as const })));
    await invalidateAround(db, event.id);
    let sawTarget = false;
    expect(await processNarrative(aiEnv(async (_model, input) => {
      if (input.messages[1].content.startsWith('{"existingSummary"')) {
        expect(JSON.parse(input.messages[1].content).existingSummary).toBe(summary);
        sawTarget = true;
        return { response: "NO_CHANGE" };
      }
      return { response: "Current memories describe rain and music." };
    }), event.id, 25_000)).toBe(true);
    expect(sawTarget).toBe(true);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe(summary);
  });


  it("rejects an expired worker even after its replacement completes with no change", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "expired-worker", name: "Expired Worker", summary: "Keep this wording." }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "A memory.", incorporatePref: "yes" });
    await invalidateAround(db, event.id);
    expect(await processNarrative(aiEnv(async () => {
      await db.update(narrativeJobs).set({ leaseUntil: "2000-01-01T00:00:00.000Z" }).where(eq(narrativeJobs.eventId, event.id));
      expect(await processNarrative(aiEnv(async () => ({ response: "NO_CHANGE" })), event.id, 25_000)).toBe(true);
      return { response: "Stale worker's prose." };
    }), event.id, 25_000)).toBe(false);
    expect((await db.select().from(events).where(eq(events.id, event.id)).get())?.summary).toBe("Keep this wording.");
    expect((await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get())?.status).toBe("complete");
  });

});
