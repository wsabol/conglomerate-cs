import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import type { AppUser } from "../env";
import { forbidden, notFound } from "../lib/errors";

export async function getViewableMedia(
  db: Db,
  id: number,
  user: AppUser,
): Promise<typeof media.$inferSelect> {
  const row = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!row) throw notFound("Media not found.");
  return row;
}

export async function getPublishedStreamVideo(
  db: Db,
  id: number,
  user: AppUser,
): Promise<typeof media.$inferSelect> {
  const row = await getViewableMedia(db, id, user);
  if (row.mediaType !== "video" || row.status !== "published" || !row.streamUid) {
    throw notFound("Video is not ready for playback.");
  }
  return row;
}

export async function getMediaForOriginalDownload(
  db: Db,
  id: number,
  user: AppUser,
): Promise<typeof media.$inferSelect> {
  const row = await getViewableMedia(db, id, user);
  if (!row.r2Key) throw notFound("Media file not found.");
  return row;
}

export async function requireMediaMutationAccess(
  db: Db,
  id: number,
  user: AppUser,
): Promise<typeof media.$inferSelect> {
  const row = await getViewableMedia(db, id, user);
  const isOwner = row.createdBy === user.id;
  const isEditor = user.role === "editor";
  if (!isOwner && !isEditor) {
    throw forbidden("Not allowed to modify this media.");
  }
  return row;
}
