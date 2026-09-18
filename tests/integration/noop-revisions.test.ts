import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client";
import { events, narrativeJobs, objectRevisions, people, places } from "../../src/server/db/schema";
import { updatePlace } from "../../src/server/db/mutations/places";
import { updatePerson } from "../../src/server/db/mutations/people";
import { recordRevision } from "../../src/server/audit/revision";

describe("no-op revision protection", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(narrativeJobs);
    await db.delete(events);
    await db.delete(people);
    await db.delete(places);
    await db.delete(objectRevisions);
  });

  it("does not log identical update snapshots", async () => {
    const db = getDb(env);
    await recordRevision(db, { targetType: "event", targetId: 42, action: "update",
      before: { summary: "Same text" }, after: { summary: "Same text" } });
    expect(await db.select().from(objectRevisions)).toHaveLength(0);
  });

  it("leaves unchanged places and people untouched without narrative jobs", async () => {
    const db = getDb(env);
    const place = await db.insert(places).values({ name: "The Room", modifiedOn: "2001-01-01 00:00:00" }).returning().get();
    const person = await db.insert(people).values({ displayName: "Alex", modifiedOn: "2001-01-01 00:00:00" }).returning().get();
    const event = await db.insert(events).values({ slug: "linked", name: "Linked", eventDate: "2011-05-14", placeId: place.id }).returning().get();
    const revisions = async (targetType: "places" | "people", targetId: number) => db.select().from(objectRevisions).where(and(
      eq(objectRevisions.targetType, targetType), eq(objectRevisions.targetId, targetId)));

    await updatePlace(db, place.id, { name: place.name, status: place.status }, 0);
    await updatePerson(db, person.id, { displayName: person.displayName, bio: person.bio }, 0);
    expect((await db.select().from(places).where(eq(places.id, place.id)).get())?.modifiedOn).toBe(place.modifiedOn);
    expect((await db.select().from(people).where(eq(people.id, person.id)).get())?.modifiedOn).toBe(person.modifiedOn);
    expect(await revisions("places", place.id)).toHaveLength(0);
    expect(await revisions("people", person.id)).toHaveLength(0);
    expect(await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id))).toHaveLength(0);

    await updatePlace(db, place.id, { name: "The New Room" }, 0);
    expect(await revisions("places", place.id)).toHaveLength(1);
    expect(await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id))).toHaveLength(1);
  });
});
