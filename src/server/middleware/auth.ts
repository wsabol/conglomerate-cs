import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { forbidden, unauthorized } from "../lib/errors";

/** Require any authenticated (and non-disabled) user. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) throw unauthorized();
  await next();
});

/** Require the `editor` role (PRD Sec: Users and Permissions). */
export const requireEditor = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw unauthorized();
  if (user.role !== "editor") throw forbidden("Editor role required.");
  await next();
});
