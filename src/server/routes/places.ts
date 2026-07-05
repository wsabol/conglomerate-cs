import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { places } from "../db/schema";
import { getPlace, listPlaces } from "../db/queries";
import {
  placeCreateSchema,
  placeUpdateSchema,
} from "@shared/schemas/place";
import { requireEditor } from "../middleware/auth";
import { recordRevision } from "../audit/revision";
import { ok, okList } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const results = await listPlaces(getDb(c.env));
  return okList(c, results, "Returned places");
});

route.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid place id.");
  const place = await getPlace(getDb(c.env), id);
  if (!place) throw notFound("Place not found.");
  return ok(c, place, "Returned place");
});

route.post("/", requireEditor, async (c) => {
  const user = c.get("user")!;
  const input = placeCreateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const inserted = await db
    .insert(places)
    .values({
      name: input.name,
      placeType: input.placeType ?? null,
      address: input.address ?? null,
      status: input.status,
    })
    .returning()
    .get();

  await recordRevision(db, {
    targetType: "places",
    targetId: inserted.id,
    action: "create",
    after: inserted,
    changedBy: user.id,
  });

  return ok(c, await getPlace(db, inserted.id), "Place created", 201);
});

route.patch("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid place id.");
  const input = placeUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const existing = await db
    .select()
    .from(places)
    .where(and(eq(places.id, id), eq(places.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Place not found.");

  await db
    .update(places)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.placeType !== undefined ? { placeType: input.placeType } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(places.id, id));

  const updated = await db.select().from(places).where(eq(places.id, id)).get();

  await recordRevision(db, {
    targetType: "places",
    targetId: id,
    action: "update",
    before: existing,
    after: updated,
    changedBy: user.id,
  });

  return ok(c, await getPlace(db, id), "Place updated");
});

route.delete("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid place id.");
  const db = getDb(c.env);

  const existing = await db
    .select()
    .from(places)
    .where(and(eq(places.id, id), eq(places.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Place not found.");

  await db
    .update(places)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(places.id, id));

  await recordRevision(db, {
    targetType: "places",
    targetId: id,
    action: "delete",
    before: existing,
    changedBy: user.id,
  });

  return ok(c, { id }, "Place deleted");
});

export default route;
