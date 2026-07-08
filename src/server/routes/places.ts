import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getPlace, listPlaces } from "../db/queries";
import {
  createPlace,
  softDeletePlace,
  updatePlace,
} from "../db/mutations/places";
import {
  placeCreateSchema,
  placeUpdateSchema,
} from "@shared/schemas/place";
import { requireEditor } from "../middleware/auth";
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

  const place = await createPlace(db, input, user.id);
  return ok(c, place, "Place created", 201);
});

route.patch("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid place id.");
  const input = placeUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const place = await updatePlace(db, id, input, user.id);
  if (!place) throw notFound("Place not found.");
  return ok(c, place, "Place updated");
});

route.delete("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid place id.");
  const db = getDb(c.env);

  const deleted = await softDeletePlace(db, id, user.id);
  if (!deleted) throw notFound("Place not found.");
  return ok(c, { id }, "Place deleted");
});

export default route;
