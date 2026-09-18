import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getArchiveStats, getRecentActivity } from "../db/queries";
import { getConfig, HOME_ACTIVITY_LIMIT } from "../lib/config";
import { ok } from "../lib/response";

const route = new Hono<AppEnv>();

route.get("/activity", async (c) => {
  return ok(c, await getRecentActivity(getDb(c.env), HOME_ACTIVITY_LIMIT), "Returned recent activity");
});

route.get("/", async (c) => {
  const { archiveYearsActive } = getConfig(c.env);
  const stats = await getArchiveStats(getDb(c.env), archiveYearsActive);
  return ok(c, stats, "Returned archive stats");
});

export default route;
