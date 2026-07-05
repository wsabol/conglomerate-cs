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
import { requireEditor } from "../middleware/auth";
import { ok, okList } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";

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

export default route;
