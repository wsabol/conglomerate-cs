import { and, desc, eq, inArray, like } from "drizzle-orm";
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
import { mediaDeliveryUrl, mediaThumbUrl } from "../../media/url";

async function attachMediaPeople(
  db: Db,
  rows: (typeof media.$inferSelect)[],
  eventMeta?: { id: number; slug: string | null; title: string | null }[],
): Promise<MediaItemDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
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

  return rows.map((row) => {
    const event = eventByMediaId.get(row.id);
    return {
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      status: row.status,
      capturedDate: row.capturedDate,
      datePrecision: row.datePrecision,
      description: row.description,
      eventId: row.eventId,
      eventSlug: event?.slug ?? null,
      eventTitle: event?.title ?? null,
      provenance: row.provenance,
      url: row.mediaType === "link" ? row.externalUrl : mediaDeliveryUrl(row.id),
      thumbUrl: row.thumbKey ? mediaThumbUrl(row.id) : null,
      people: byMedia.get(row.id) ?? [],
    };
  });
}

export async function listMediaForEvent(
  db: Db,
  eventId: number,
): Promise<MediaItemDTO[]> {
  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.eventId, eventId),
        eq(media.status, "published"),
        eq(media.isDeleted, false),
      ),
    )
    .orderBy(desc(media.createdOn));
  return attachMediaPeople(db, rows);
}

export async function listMedia(
  db: Db,
  q: MediaQuery,
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
  );
}

export async function getMediaItemById(
  db: Db,
  id: number,
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
