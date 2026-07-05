import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { people } from "../db/schema";
import { getPerson, listPeople } from "../db/queries";
import {
  personCreateSchema,
  personUpdateSchema,
} from "@shared/schemas/person";
import { requireEditor } from "../middleware/auth";
import { recordRevision } from "../audit/revision";
import { ok, okList } from "../lib/response";
import { badRequest, notFound } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const results = await listPeople(getDb(c.env));
  return okList(c, results, "Returned people");
});

route.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid person id.");
  const person = await getPerson(getDb(c.env), id);
  if (!person) throw notFound("Person not found.");
  return ok(c, person, "Returned person");
});

route.post("/", requireEditor, async (c) => {
  const user = c.get("user")!;
  const input = personCreateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const inserted = await db
    .insert(people)
    .values({
      displayName: input.displayName,
      aliases: input.aliases ?? null,
      bio: input.bio ?? null,
    })
    .returning()
    .get();

  await recordRevision(db, {
    targetType: "people",
    targetId: inserted.id,
    action: "create",
    after: inserted,
    changedBy: user.id,
  });

  return ok(
    c,
    {
      id: inserted.id,
      displayName: inserted.displayName,
      aliases: inserted.aliases,
      bio: inserted.bio,
    },
    "Person created",
    201,
  );
});

route.patch("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid person id.");
  const input = personUpdateSchema.parse(await c.req.json());
  const db = getDb(c.env);

  const existing = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Person not found.");

  await db
    .update(people)
    .set({
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(people.id, id));

  const updated = await db.select().from(people).where(eq(people.id, id)).get();

  await recordRevision(db, {
    targetType: "people",
    targetId: id,
    action: "update",
    before: existing,
    after: updated,
    changedBy: user.id,
  });

  const person = await getPerson(db, id);
  return ok(c, person, "Person updated");
});

route.delete("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid person id.");
  const db = getDb(c.env);

  const existing = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.isDeleted, false)))
    .get();
  if (!existing) throw notFound("Person not found.");

  await db
    .update(people)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(people.id, id));

  await recordRevision(db, {
    targetType: "people",
    targetId: id,
    action: "delete",
    before: existing,
    changedBy: user.id,
  });

  return ok(c, { id }, "Person deleted");
});

export default route;
