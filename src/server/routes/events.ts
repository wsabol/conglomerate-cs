import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { events, narrativeJobs } from "../db/schema";
import { getEventDetail, listEvents, listEventsDetailed } from "../db/queries";
import {
  createEvent,
  softDeleteEvent,
  updateEventById,
  updateEventBySlug,
} from "../db/mutations/events";
import { eventsQuerySchema } from "@shared/schemas/query";
import {
  eventCreateSchema,
  eventUpdateSchema,
  eventSummaryDraftSchema,
} from "@shared/schemas/event";
import { requireEditor } from "../middleware/auth";
import { ok, okList } from "../lib/response";
import { ApiError, badGateway, notFound } from "../lib/errors";
import { getConfig } from "../lib/config";
import { invalidateNarratives, publicNarrativeJob } from "../narrative/jobs";
import { processNarrative } from "../narrative/worker";
import { generateSummaryDraft } from "../narrative/draft";

const route = new Hono<AppEnv>();

route.post("/:slug/summary-draft", requireEditor, async (c) => {
  const input = eventSummaryDraftSchema.parse(await c.req.json());
  const event = await getDb(c.env).select({ id: events.id }).from(events)
    .where(and(eq(events.slug, c.req.param("slug")), eq(events.isDeleted, false))).get();
  if (!event) throw notFound("Event not found.");
  try {
    return ok(c, await generateSummaryDraft(c.env, event.id, input), "Generated summary draft");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badGateway("Could not generate a summary draft. Try again.");
  }
});

route.get("/:slug/summary-status", async (c) => {
  const db = getDb(c.env);
  const event = await db.select({ id: events.id, summary: events.summary }).from(events).where(and(eq(events.slug, c.req.param("slug")), eq(events.isDeleted, false))).get();
  if (!event) throw notFound("Event not found.");
  const job = await db.select({
    status: narrativeJobs.status,
    requestedVersion: narrativeJobs.requestedVersion,
    completedVersion: narrativeJobs.completedVersion,
    errorCode: narrativeJobs.errorCode,
    leaseUntil: narrativeJobs.leaseUntil,
  }).from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
  return ok(c, { summary: event.summary, job: getConfig(c.env).narrativesEnabled ? publicNarrativeJob(job) : null }, "Returned summary status");
});

route.post("/:slug/summary-retry", requireEditor, async (c) => {
  const db = getDb(c.env);
  const event = await db.select({ id: events.id, summary: events.summary }).from(events)
    .where(and(eq(events.slug, c.req.param("slug")), eq(events.isDeleted, false))).get();
  if (!event) throw notFound("Event not found.");
  const job = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
  if (!job || publicNarrativeJob(job)?.status !== "failed") return ok(c,
    { summary: event.summary, job: publicNarrativeJob(job) }, "Summary update is not awaiting a retry");
  await invalidateNarratives(db, [event.id]);
  if (getConfig(c.env).narrativesEnabled) {
    try { c.executionCtx.waitUntil(processNarrative(c.env, event.id, 25_000)); }
    catch { /* The scheduled worker still owns the queued retry. */ }
  }
  const queued = await db.select().from(narrativeJobs).where(eq(narrativeJobs.eventId, event.id)).get();
  return ok(c, { summary: event.summary, job: publicNarrativeJob(queued) }, "Summary update queued");
});

route.get("/", async (c) => {
  const query = eventsQuerySchema.parse(c.req.query());
  const db = getDb(c.env);
  if (query.detailed) {
    const results = await listEventsDetailed(db, query);
    return okList(c, results, "Returned detailed event list");
  }
  const results = await listEvents(db, query);
  return okList(c, results, "Returned event list");
});

route.get("/:slug", async (c) => {
  const detail = await getEventDetail(getDb(c.env), c.req.param("slug"), c.env.MEDIA);
  if (!detail) throw notFound("Event not found.");
  return ok(c, { ...detail, narrativesEnabled: !!getConfig(c.env).narrativesEnabled, summaryJob: getConfig(c.env).narrativesEnabled ? detail.summaryJob : null }, "Returned event");
});

route.post("/", requireEditor, async (c) => {
  const user = c.get("user")!;
  const input = eventCreateSchema.parse(await c.req.json());
  const detail = await createEvent(getDb(c.env), input, user.id);
  return ok(c, detail, "Event created", 201);
});

route.patch("/:idOrSlug", requireEditor, async (c) => {
  const user = c.get("user")!;
  const param = c.req.param("idOrSlug");
  const input = eventUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const detail = /^\d+$/.test(param)
    ? await updateEventById(db, Number(param), input, user.id)
    : await updateEventBySlug(db, param, input, user.id);

  if (!detail) throw notFound("Event not found.");
  return ok(c, detail, "Event updated");
});

route.delete("/:idOrSlug", requireEditor, async (c) => {
  const user = c.get("user")!;
  const param = c.req.param("idOrSlug");
  const db = getDb(c.env);

  let slug = param;
  if (/^\d+$/.test(param)) {
    const row = await db
      .select({ slug: events.slug })
      .from(events)
      .where(and(eq(events.id, Number(param)), eq(events.isDeleted, false)))
      .get();
    if (!row) throw notFound("Event not found.");
    slug = row.slug;
  }

  const deleted = await softDeleteEvent(db, slug, user.id);
  if (!deleted) throw notFound("Event not found.");
  return ok(c, { slug }, "Event deleted");
});

export default route;
