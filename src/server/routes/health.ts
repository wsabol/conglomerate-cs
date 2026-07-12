import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

const route = new Hono<AppEnv>();

route.get("/", (c) =>
  ok(c, { ok: true, environment: c.env.ENVIRONMENT }, "healthy"),
);

export default route;
