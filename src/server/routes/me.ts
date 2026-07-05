import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { people } from "../db/schema";
import { ok } from "../lib/response";
import { unauthorized } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const user = c.get("user");
  if (!user) throw unauthorized();

  let displayName: string | null = null;
  if (user.personId) {
    const person = await getDb(c.env)
      .select({ displayName: people.displayName })
      .from(people)
      .where(eq(people.id, user.personId))
      .get();
    displayName = person?.displayName ?? null;
  }
  if (!displayName) displayName = user.email.split("@")[0] ?? user.email;

  return ok(
    c,
    {
      id: user.id,
      email: user.email,
      role: user.role,
      personId: user.personId,
      displayName,
    },
    "Returned current user",
  );
});

export default route;
