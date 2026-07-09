import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getArchiveStats } from "../db/queries";
import { getConfig } from "../lib/config";
import { ok } from "../lib/response";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const { archiveYearsActive } = getConfig(c.env);
  const stats = await getArchiveStats(getDb(c.env), archiveYearsActive);
  return ok(c, stats, "Returned archive stats");
});

export default route;
