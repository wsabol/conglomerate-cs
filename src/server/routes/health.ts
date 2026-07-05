import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

const route = new Hono<AppEnv>();

route.get("/", (c) => {
  const user = c.get("user");
  return ok(
    c,
    {
      ok: true,
      environment: c.env.ENVIRONMENT,
      user: user ? { email: user.email, role: user.role } : null,
    },
    "healthy",
  );
});

export default route;
