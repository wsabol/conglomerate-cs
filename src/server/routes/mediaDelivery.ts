import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { media } from "../db/schema";
import { identity } from "../middleware/identity";
import { unauthorized, notFound } from "../lib/errors";
import { getConfig } from "../lib/config";
import { resolveMediaKey } from "../media/presign";
import {
  contentRange,
  parseRangeHeader,
} from "../media/checksum";

const route = new Hono<AppEnv>();

route.use("*", identity);

/** Authenticated media delivery with byte-range support for A/V playback. */
route.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) throw unauthorized();

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw notFound("Media not found.");

  const db = getDb(c.env);
  const row = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.id, id),
        eq(media.status, "published"),
        eq(media.isDeleted, false),
      ),
    )
    .get();
  if (!row) throw notFound("Media not found.");

  const variant = c.req.query("variant") ?? null;
  const key = resolveMediaKey(row, variant);
  if (!key) throw notFound("Media file not found.");

  const object = await c.env.MEDIA.get(key);
  if (!object) throw notFound("Media file not found.");

  const config = getConfig(c.env);
  const mime = object.httpMetadata?.contentType ?? row.mimeType ?? "application/octet-stream";
  const inline =
    row.mediaType === "photo" ||
    config.inlinePlayback.audio.includes(mime) ||
    config.inlinePlayback.video.includes(mime);

  const cacheControl = "private, max-age=86400";
  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": cacheControl,
    "Accept-Ranges": "bytes",
    ...(inline
      ? { "Content-Disposition": "inline" }
      : { "Content-Disposition": `attachment; filename="${row.originalFilename ?? "file"}"` }),
  };

  const range = c.req.header("Range") ?? null;
  const parsed = parseRangeHeader(range, object.size);

  if (parsed) {
    const ranged = await c.env.MEDIA.get(key, {
      range: { offset: parsed.offset, length: parsed.length },
    });
    if (!ranged) throw notFound("Media file not found.");
    const end = parsed.offset + parsed.length - 1;
    return new Response(ranged.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": contentRange(parsed.offset, end, object.size),
        "Content-Length": String(parsed.length),
      },
    });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(object.size),
    },
  });
});

export default route;
