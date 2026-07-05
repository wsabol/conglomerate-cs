import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { events } from "../db/schema";
import { getEventDetail, listEvents } from "../db/queries";
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
} from "@shared/schemas/event";
import { requireEditor } from "../middleware/auth";
import { ok, okList } from "../lib/response";
import { notFound } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const query = eventsQuerySchema.parse(c.req.query());
  const results = await listEvents(getDb(c.env), query);
  return okList(c, results, "Returned event list");
});

route.get("/:slug", async (c) => {
  const detail = await getEventDetail(getDb(c.env), c.req.param("slug"));
  if (!detail) throw notFound("Event not found.");
  return ok(c, detail, "Returned event");
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
