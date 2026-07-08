import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getPerson, listPeople } from "../db/queries";
import {
  createPerson,
  softDeletePerson,
  updatePerson,
} from "../db/mutations/people";
import {
  personCreateSchema,
  personUpdateSchema,
} from "@shared/schemas/person";
import { requireEditor } from "../middleware/auth";
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

  const inserted = await createPerson(db, input, user.id);

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

  const person = await updatePerson(db, id, input, user.id);
  if (!person) throw notFound("Person not found.");
  return ok(c, person, "Person updated");
});

route.delete("/:id", requireEditor, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw badRequest("Invalid person id.");
  const db = getDb(c.env);

  const deleted = await softDeletePerson(db, id, user.id);
  if (!deleted) throw notFound("Person not found.");
  return ok(c, { id }, "Person deleted");
});

export default route;
