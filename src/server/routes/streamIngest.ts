import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { media } from "../db/schema";
import { verifyWorkerIngestToken } from "../media/ingestUrl";

const route = new Hono<AppEnv>();

/** Token-gated R2 original stream for Cloudflare Stream copy-by-URL ingestion. */
route.get("/:id", async (c) => {
  const secret = c.env.STREAM_WEBHOOK_SECRET;
  if (!secret) return c.text("Not configured.", 503);

  const id = Number(c.req.param("id"));
  const exp = Number(c.req.query("exp"));
  const token = c.req.query("token") ?? "";
  if (!Number.isInteger(id) || !Number.isFinite(exp) || !token) {
    return c.text("Unauthorized.", 401);
  }

  const db = getDb(c.env);
  const row = await db
    .select()
    .from(media)
    .where(eq(media.id, id))
    .get();
  if (!row?.r2Key) return c.text("Not found.", 404);

  const valid = await verifyWorkerIngestToken(
    secret,
    id,
    row.r2Key,
    exp,
    token,
  );
  if (!valid) return c.text("Unauthorized.", 401);

  const object = await c.env.MEDIA.get(row.r2Key);
  if (!object) return c.text("Not found.", 404);

  const mime =
    object.httpMetadata?.contentType ??
    row.mimeType ??
    "application/octet-stream";

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
    },
  });
});

export default route;
