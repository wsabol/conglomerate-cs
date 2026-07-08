import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { uploadCreateSchema } from "@shared/schemas/media";
import { requireUser } from "../middleware/auth";
import {
  beginUpload,
  completeUpload,
  receiveUploadBody,
} from "../db/mutations/uploads";
import { ok } from "../lib/response";
import { badRequest } from "../lib/errors";

const route = new Hono<AppEnv>();

route.post("/", requireUser, async (c) => {
  const user = c.get("user")!;
  const input = uploadCreateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const target = await beginUpload(c.env, db, input, user.id);
  return ok(c, target, "Upload authorized", 201);
});

route.put("/:id/body", requireUser, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid upload id.");
  const user = c.get("user")!;
  const body = await c.req.arrayBuffer();

  const result = await receiveUploadBody(c.env, getDb(c.env), id, user, body);
  return ok(c, result, "Upload received");
});

route.post("/:id/complete", requireUser, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid upload id.");
  const user = c.get("user")!;

  const dto = await completeUpload(c.env, getDb(c.env), id, user);
  return ok(c, dto, "Media published");
});

export default route;
