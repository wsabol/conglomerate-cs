import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { people } from "../db/schema";
import { getConfig } from "../lib/config";
import { ok } from "../lib/response";
import { unauthorized } from "../lib/errors";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const user = c.get("user");
  if (!user) throw unauthorized();

  const config = getConfig(c.env);

  let displayName: string | null = null;
  let instrument: string | null = null;
  if (user.personId) {
    const person = await getDb(c.env)
      .select({ displayName: people.displayName, instrument: people.instrument })
      .from(people)
      .where(eq(people.id, user.personId))
      .get();
    displayName = person?.displayName ?? null;
    instrument = person?.instrument ?? null;
  }
  if (!displayName) displayName = user.email.split("@")[0] ?? user.email;

  const logoutUrl = config.accessTeamDomain
    ? `https://${config.accessTeamDomain}/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(config.appBaseUrl)}`
    : null;

  return ok(
    c,
    {
      id: user.id,
      email: user.email,
      role: user.role,
      personId: user.personId,
      displayName,
      instrument,
      logoutUrl,
    },
    "Returned current user",
  );
});

export default route;
