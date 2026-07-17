import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { media } from "../db/schema";
import { identity } from "../middleware/identity";
import { unauthorized, notFound, badRequest } from "../lib/errors";
import { isInlinePlayable } from "@shared/mediaPlayback";
import { resolveMediaKey } from "../media/presign";
import { getMediaForOriginalDownload } from "../media/access";
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

  const variant = c.req.query("variant") ?? null;
  const db = getDb(c.env);

  let row: typeof media.$inferSelect;
  if (variant === "original") {
    row = await getMediaForOriginalDownload(db, id, user);
  } else {
    const published = await db
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
    if (!published) throw notFound("Media not found.");
    row = published;
  }

  const key = resolveMediaKey(row, variant);
  if (!key) {
    if (row.mediaType === "video" && row.processingProvider === "stream") {
      throw badRequest(
        "Use /api/media/:id/playback for Stream video playback.",
      );
    }
    throw notFound("Media file not found.");
  }

  const object = await c.env.MEDIA.get(key);
  if (!object) throw notFound("Media file not found.");

  const mime = object.httpMetadata?.contentType ?? row.mimeType ?? "application/octet-stream";
  const inline =
    variant !== "original" &&
    isInlinePlayable(row.mediaType, mime, row.videoCodec);

  const cacheControl = "private, max-age=86400";
  const disposition =
    variant === "original"
      ? `attachment; filename="${row.originalFilename ?? "file"}"`
      : inline
        ? "inline"
        : `attachment; filename="${row.originalFilename ?? "file"}"`;

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": cacheControl,
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
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
