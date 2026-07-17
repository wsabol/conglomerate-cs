import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { listMedia, getMediaItemById } from "../db/queries";
import { softDeleteMedia, updateMedia } from "../db/mutations/media";
import { mediaQuerySchema } from "@shared/schemas/query";
import { mediaUpdateSchema } from "@shared/schemas/media";
import { requireUser } from "../middleware/auth";
import { ok, okList } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const query = mediaQuerySchema.parse(c.req.query());
  const results = await listMedia(getDb(c.env), query, c.env.MEDIA);
  return okList(c, results, "Returned media");
});

route.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const item = await getMediaItemById(getDb(c.env), id, c.env.MEDIA);
  if (!item) throw notFound("Media not found.");
  return ok(c, item, "Returned media");
});

route.patch("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const input = mediaUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const dto = await updateMedia(db, id, input, user);
  if (!dto) throw notFound("Media not found.");
  return ok(c, dto, "Media updated");
});

route.delete("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const db = getDb(c.env);

  const deleted = await softDeleteMedia(db, id, user);
  if (!deleted) throw notFound("Media not found.");
  return ok(c, { id }, "Media deleted");
});

export default route;
