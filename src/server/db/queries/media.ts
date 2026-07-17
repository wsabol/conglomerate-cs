import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  eventPerformanceDetails,
  events,
  media,
  mediaPeople,
  people,
} from "../schema";
import type { MediaQuery } from "@shared/schemas/query";
import type { MediaItemDTO } from "@shared/dto";
import type { Env } from "../../env";
import { sniffVideoCodec } from "../../media/codec";
import { toMediaItemDTO } from "../../media/dto";

const CODEC_TAIL_BYTES = 5_000_000;

async function ensureVideoCodec(
  db: Db,
  bucket: Env["MEDIA"],
  row: typeof media.$inferSelect,
): Promise<string | null> {
  if (row.mediaType !== "video" || row.videoCodec || !row.r2Key || !row.size) {
    return row.videoCodec;
  }

  const offset = Math.max(0, row.size - CODEC_TAIL_BYTES);
  const length = Math.min(row.size, CODEC_TAIL_BYTES);
  const object = await bucket.get(row.r2Key, {
    range: { offset, length },
  });
  if (!object) return null;

  const codec = sniffVideoCodec(await object.arrayBuffer());
  if (!codec) return null;

  await db
    .update(media)
    .set({ videoCodec: codec, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(media.id, row.id));

  return codec;
}

async function attachMediaPeople(
  db: Db,
  rows: (typeof media.$inferSelect)[],
  eventMeta?: { id: number; slug: string | null; title: string | null }[],
  bucket?: Env["MEDIA"],
): Promise<MediaItemDTO[]> {
  if (rows.length === 0) return [];

  const resolvedRows = bucket
    ? await Promise.all(
        rows.map(async (row) => {
          if (row.mediaType !== "video" || row.videoCodec) return row;
          const codec = await ensureVideoCodec(db, bucket, row);
          return codec ? { ...row, videoCodec: codec } : row;
        }),
      )
    : rows;

  const ids = resolvedRows.map((row) => row.id);
  const links = await db
    .select({
      mediaId: mediaPeople.mediaId,
      personId: people.id,
      displayName: people.displayName,
    })
    .from(mediaPeople)
    .innerJoin(people, eq(people.id, mediaPeople.personId))
    .where(inArray(mediaPeople.mediaId, ids));

  const byMedia = new Map<number, { id: number; displayName: string }[]>();
  for (const link of links) {
    const list = byMedia.get(link.mediaId) ?? [];
    list.push({ id: link.personId, displayName: link.displayName });
    byMedia.set(link.mediaId, list);
  }

  const eventByMediaId = new Map((eventMeta ?? []).map((event) => [event.id, event]));

  return resolvedRows.map((row) => {
    const event = eventByMediaId.get(row.id);
    return toMediaItemDTO(row, event, byMedia.get(row.id) ?? []);
  });
}

export async function listMediaForEvent(
  db: Db,
  eventId: number,
  bucket?: Env["MEDIA"],
): Promise<MediaItemDTO[]> {
  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.eventId, eventId),
        eq(media.isDeleted, false),
        sql`(
          ${media.status} = 'published'
          OR (
            ${media.mediaType} = 'video'
            AND ${media.status} IN ('uploading', 'uploaded', 'processing', 'failed')
          )
        )`,
      ),
    )
    .orderBy(desc(media.createdOn));
  return attachMediaPeople(db, rows, undefined, bucket);
}

export async function listMedia(
  db: Db,
  q: MediaQuery,
  bucket?: Env["MEDIA"],
): Promise<MediaItemDTO[]> {
  const conds = [eq(media.status, "published"), eq(media.isDeleted, false)];
  if (q.media_type) conds.push(eq(media.mediaType, q.media_type));
  if (q.year) conds.push(like(media.capturedDate, `${q.year}-%`));
  if (q.person) {
    conds.push(
      inArray(
        media.id,
        db
          .select({ id: mediaPeople.mediaId })
          .from(mediaPeople)
          .where(eq(mediaPeople.personId, q.person)),
      ),
    );
  }

  const rows = await db
    .select({
      media: media,
      eventSlug: events.slug,
      eventName: events.name,
      billingName: eventPerformanceDetails.billingName,
    })
    .from(media)
    .leftJoin(events, eq(events.id, media.eventId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, media.eventId),
    )
    .where(and(...conds))
    .orderBy(desc(media.createdOn));

  return attachMediaPeople(
    db,
    rows.map((row) => row.media),
    rows.map((row) => ({
      id: row.media.id,
      slug: row.eventSlug,
      title: row.billingName || row.eventName,
    })),
    bucket,
  );
}

export async function getMediaItemById(
  db: Db,
  id: number,
  bucket?: Env["MEDIA"],
): Promise<MediaItemDTO | null> {
  const row = await db
    .select({
      media: media,
      eventSlug: events.slug,
      eventName: events.name,
      billingName: eventPerformanceDetails.billingName,
    })
    .from(media)
    .leftJoin(events, eq(events.id, media.eventId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, media.eventId),
    )
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();

  if (!row) return null;

  const [dto] = await attachMediaPeople(
    db,
    [row.media],
    [
      {
        id: row.media.id,
        slug: row.eventSlug,
        title: row.billingName || row.eventName,
      },
    ],
    bucket,
  );
  return dto ?? null;
}

/** Published, non-deleted media with the given checksum (for upload dedup). */
export async function findPublishedMediaByChecksum(
  db: Db,
  checksum: string,
): Promise<{
  id: number;
  eventId: number | null;
  eventTitle: string | null;
  eventSlug: string | null;
} | null> {
  const row = await db
    .select({
      id: media.id,
      eventId: media.eventId,
      eventSlug: events.slug,
      eventName: events.name,
      billingName: eventPerformanceDetails.billingName,
    })
    .from(media)
    .leftJoin(events, eq(events.id, media.eventId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, media.eventId),
    )
    .where(
      and(
        eq(media.checksum, checksum),
        eq(media.status, "published"),
        eq(media.isDeleted, false),
      ),
    )
    .get();

  if (!row) return null;

  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: row.billingName || row.eventName,
    eventSlug: row.eventSlug,
  };
}
