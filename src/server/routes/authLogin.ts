import { Hono } from "hono";
import { accessLoginQuerySchema } from "@shared/schemas/auth";
import type { AppEnv } from "../env";
import { buildAccessLoginUrl } from "../auth/access";
import { getConfig } from "../lib/config";
import { ApiError } from "../lib/errors";
import { ok } from "../lib/response";

const route = new Hono<AppEnv>();

route.get("/login", (c) => {
  const { next } = accessLoginQuerySchema.parse(c.req.query());
  const config = getConfig(c.env);
  const localDevAuth =
    c.env.ENVIRONMENT !== "production" &&
    !config.accessEnforced &&
    Boolean(config.devUserEmail);
  if (!config.accessEnforced && !localDevAuth) {
    throw new ApiError(503, "Sign-in is unavailable.");
  }
  const url = buildAccessLoginUrl(c.req.url, next ?? null, config);
  if (!url) throw new ApiError(503, "Sign-in is unavailable.");
  c.header("Cache-Control", "private, no-store");
  return ok(c, { url, localDevAuth }, "Returned sign-in destination");
});

export default route;
