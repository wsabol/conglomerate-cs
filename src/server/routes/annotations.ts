import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getAnnotationById, getAnnotations } from "../db/queries";
import {
  createAnnotation,
  softDeleteAnnotation,
  updateAnnotation,
} from "../db/mutations/annotations";
import {
  annotationCreateSchema,
  annotationUpdateSchema,
} from "@shared/schemas/annotation";
import { ANNOTATION_TARGET_TYPES, type AnnotationTargetType } from "@shared/types";
import { requireUser } from "../middleware/auth";
import { ok, okList } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const targetType = c.req.query("targetType");
  const targetId = Number(c.req.query("targetId"));
  if (
    !targetType ||
    !ANNOTATION_TARGET_TYPES.includes(targetType as AnnotationTargetType) ||
    !Number.isInteger(targetId)
  ) {
    throw badRequest("targetType and numeric targetId are required.");
  }
  const results = await getAnnotations(
    getDb(c.env),
    targetType as AnnotationTargetType,
    targetId,
  );
  return okList(c, results, "Returned memories");
});

route.post("/", requireUser, async (c) => {
  const user = c.get("user")!;
  const input = annotationCreateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const dto = await createAnnotation(db, input, user);
  return ok(c, dto, "Memory added", 201);
});

route.patch("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid memory id.");
  const input = annotationUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const dto = await updateAnnotation(db, id, input, user);
  if (!dto) throw notFound("Memory not found.");
  return ok(c, dto, "Memory updated");
});

route.delete("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid memory id.");
  const db = getDb(c.env);

  const deleted = await softDeleteAnnotation(db, id, user);
  if (!deleted) throw notFound("Memory not found.");
  return ok(c, { id }, "Memory deleted");
});

export default route;
