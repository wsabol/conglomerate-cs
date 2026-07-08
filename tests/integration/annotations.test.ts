import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import {
  annotationPeople,
  annotations,
  events,
  people,
  users,
} from "../../src/server/db/schema";
import { formatMention } from "../../src/shared/mentions";
import type { ApiResponse } from "../../src/shared/types";
import type { AnnotationDTO } from "../../src/shared/dto";

async function seed() {
  const db = getDb(env);
  const person = await db
    .insert(people)
    .values({ displayName: "McIan", aliases: "Ian" })
    .returning()
    .get();
  const event = await db
    .insert(events)
    .values({
      slug: "test-show-2011-05-14",
      name: "Test Show",
      eventType: "performance",
      eventDate: "2011-05-14",
      datePrecision: "exact",
      confidence: "high",
    })
    .returning()
    .get();
  return { person, event };
}

describe("annotation @mentions", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(annotationPeople);
    await db.delete(annotations);
    await db.delete(events);
    await db.delete(people);
    await db.delete(users);
  });

  it("creates annotation_people rows from mention tokens in body", async () => {
    const { person, event } = await seed();
    const body = `${formatMention("McIan", person.id)} played the solo`;

    const res = await app.request(
      "/api/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "event",
          targetId: event.id,
          body,
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const payload = (await res.json()) as ApiResponse<AnnotationDTO>;
    expect(payload.data?.people).toEqual([
      { id: person.id, displayName: "McIan" },
    ]);
  });

  it("updates annotation_people when mention tokens are removed", async () => {
    const { person, event } = await seed();
    const createRes = await app.request(
      "/api/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "event",
          targetId: event.id,
          body: `${formatMention("McIan", person.id)} played the solo`,
        }),
      },
      env,
    );
    const created = (await createRes.json()) as ApiResponse<AnnotationDTO>;
    const id = created.data!.id;

    const patchRes = await app.request(
      `/api/annotations/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "No mentions here." }),
      },
      env,
    );

    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as ApiResponse<AnnotationDTO>;
    expect(updated.data?.people).toEqual([]);

    const db = getDb(env);
    const links = await db
      .select()
      .from(annotationPeople)
      .where(eq(annotationPeople.annotationId, id));
    expect(links).toEqual([]);
  });

  it("ignores invalid person IDs in mention tokens", async () => {
    const { event } = await seed();
    const body = `${formatMention("Nobody", 99999)} was not there`;

    const res = await app.request(
      "/api/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "event",
          targetId: event.id,
          body,
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const payload = (await res.json()) as ApiResponse<AnnotationDTO>;
    expect(payload.data?.people).toEqual([]);
  });
});
