import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { listRevisions, listUsers } from "../db/queries";
import {
  revisionsQuerySchema,
  userUpdateSchema,
} from "@shared/schemas/admin";
import {
  inviteCreateSchema,
  invitesListQuerySchema,
} from "@shared/schemas/invite";
import { requireEditor } from "../middleware/auth";
import { ok, okList } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";
import { listInvites } from "../db/queries/invites";
import { processInvite } from "../services/invite";
import { runStreamBackfill } from "../media/backfill";
import { getMediaProcessingDiagnostics } from "../media/diagnostics";
import { z } from "zod";

const streamBackfillQuerySchema = z.object({
  dry_run: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  media_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  retry_failed: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const route = new Hono<AppEnv>();

route.get("/users", requireEditor, async (c) => {
  const results = await listUsers(getDb(c.env));
  return okList(c, results, "Returned users");
});

route.patch("/users/:id", requireEditor, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid user id.");
  const input = userUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const existing = await db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) throw notFound("User not found.");

  await db
    .update(users)
    .set({
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isDeleted !== undefined ? { isDeleted: input.isDeleted } : {}),
      ...(input.personId !== undefined ? { personId: input.personId } : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(users.id, id));

  const updated = await db.select().from(users).where(eq(users.id, id)).get();
  return ok(
    c,
    {
      id: updated!.id,
      email: updated!.email,
      role: updated!.role,
      personId: updated!.personId,
      isDeleted: updated!.isDeleted,
    },
    "User updated",
  );
});

route.get("/revisions", requireEditor, async (c) => {
  const query = revisionsQuerySchema.parse(c.req.query());
  const results = await listRevisions(getDb(c.env), query);
  return okList(c, results, "Returned change history");
});

route.get("/invites", requireEditor, async (c) => {
  const query = invitesListQuerySchema.parse(c.req.query());
  const results = await listInvites(getDb(c.env), query.limit);
  return okList(c, results, "Returned invites");
});

route.post("/invites", requireEditor, async (c) => {
  const input = inviteCreateSchema.parse(await c.req.json());
  const user = c.get("user")!;
  const invite = await processInvite(
    getDb(c.env),
    c.env,
    input,
    user.id,
    user.email,
  );
  return ok(c, invite, "Invite sent", 201);
});

route.post("/media/stream-backfill", requireEditor, async (c) => {
  const query = streamBackfillQuerySchema.parse(c.req.query());
  const result = await runStreamBackfill(c.env, getDb(c.env), {
    dryRun: query.dry_run,
    mediaId: query.media_id,
    limit: query.limit,
    retryFailed: query.retry_failed,
  });
  return ok(c, result, "Stream backfill completed");
});

route.get("/media/:id/processing-diagnostics", requireEditor, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid media id.");
  const diagnostics = await getMediaProcessingDiagnostics(
    c.env,
    getDb(c.env),
    id,
  );
  return ok(c, diagnostics, "Media processing diagnostics");
});

export default route;
