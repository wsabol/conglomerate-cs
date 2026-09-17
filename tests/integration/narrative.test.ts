import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client";
import { annotations, eventActs, eventPeople, eventPerformanceDetails, eventSources, events, media, narrativeJobs, people, places } from "../../src/server/db/schema";
import { annotationCreateSchema, annotationUpdateSchema } from "../../src/shared/schemas/annotation";
import { invalidateAround, relatedEventIds } from "../../src/server/narrative/jobs";
import { processNarrative } from "../../src/server/narrative/worker";
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

  it("copies the human baseline without AI when only promotion and event metadata exist", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "human-copy", name: "Human Copy", summary: "The editor's exact copy: contact me@example.com", editorialSummary: "The editor's exact copy: contact me@example.com" }).returning().get();
    await db.insert(eventPerformanceDetails).values({ eventId: event.id, promotionText: "An advertised party." });
    await invalidateAround(db, event.id);
    let calls = 0;
    expect(await processNarrative(aiEnv(async () => { calls++; return { response: "Unwanted AI text" }; }), event.id, 25_000)).toBe(true);
    expect(calls).toBe(0);
    const saved = await db.select().from(events).where(eq(events.id, event.id)).get();
    expect(saved?.summary).toBe(saved?.editorialSummary);
    expect(saved?.summary).toBe("The editor's exact copy: contact me@example.com");
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
      { slug: "focal-night", name: "Focal Night", eventDate: "2011-05-14", datePrecision: "exact", placeId: place.id, editorialSummary: "The focal editorial." },
      { slug: "other-bill", name: "Other Bill", eventDate: "2011-05-14", datePrecision: "exact", placeId: otherPlace.id, editorialSummary: "FORBIDDEN NEARBY EDITORIAL" },
      { slug: "next-night", name: "Next Night", eventDate: "2011-05-15", datePrecision: "exact", placeId: place.id, editorialSummary: "FORBIDDEN NEXT DAY" },
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
    const event = await db.insert(events).values({ slug: "allowlist", name: "Allowlist", eventDate: "2011-05-01", datePrecision: "month", placeId: place.id, editorialSummary: "An important rehearsal." }).returning().get();
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
    const event = await db.insert(events).values({ slug: "long-story", name: "Long Story", editorialSummary: "A long night." }).returning().get();
    await db.insert(annotations).values([1, 2, 3].map((n) => ({ targetType: "event" as const, targetId: event.id, body: `Memory ${n}: ${"rain and music. ".repeat(550)}`, incorporatePref: "yes" as const })));
    await invalidateAround(db, event.id);
    const sizes: number[] = [];
    const result = await processNarrative(aiEnv(async (_model, input) => { sizes.push(new TextEncoder().encode(input.messages[1].content).length); return { response: "The band played through the rain." }; }), event.id, 25_000);
    expect(result).toBe(true);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(16_000);
  });

  it("uses editorial and advertised context and records incorporated revisions", async () => {
    const db = getDb(env);
    const event = await db.insert(events).values({ slug: "story", name: "Story", editorialSummary: "An early show." }).returning().get();
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
    const event = await db.insert(events).values({ slug: "changing", name: "Changing", summary: "Original", editorialSummary: "Original" }).returning().get();
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
    const event = await db.insert(events).values({ slug: "media-story", name: "Media Story", editorialSummary: "The show began late." }).returning().get();
    const photo = await db.insert(media).values({ eventId: event.id, mediaType: "photo", status: "published" }).returning().get();
    const included = await db.insert(annotations).values({ targetType: "media", targetId: photo.id, body: "We waited outside in the rain.", incorporatePref: "yes" }).returning().get();
    const legacy = await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "Legacy recollection.", incorporatePref: "no_pref" }).returning().get();
    await db.insert(annotations).values({ targetType: "event", targetId: event.id, body: "Private detail", incorporatePref: "separate", summaryStatus: "excluded" });
    await invalidateAround(db, event.id);
    const prompts: string[] = [];
    const fake = aiEnv(async (_model, input) => { prompts.push(input.messages[1].content); return { response: "The audience waited in the rain before the late show." }; });
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
    const event = await db.insert(events).values({ slug: "retry-story", name: "Retry Story", summary: "Existing text", editorialSummary: "Existing text" }).returning().get();
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
});
