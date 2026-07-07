import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { listActNames } from "../db/queries";
import { okList } from "../lib/response";

const route = new Hono<AppEnv>();

route.get("/", async (c) => {
  const results = await listActNames(getDb(c.env));
  return okList(c, results, "Returned act names");
});

export default route;
