import type { MediaItemDTO } from "@shared/dto";
import type { MediaProcessingErrorCode } from "@shared/types";
import { isInlinePlayable, isStreamPlayable } from "@shared/mediaPlayback";
import type { media } from "../db/schema";
import {
  mediaDeliveryUrl,
  mediaOriginalUrl,
  mediaPlaybackApiUrl,
  mediaThumbnailApiUrl,
  mediaThumbUrl,
} from "./url";

type MediaRow = typeof media.$inferSelect;

const PROCESSING_ERROR_MESSAGE =
  "This video could not be prepared for playback. The original file is still safely stored.";

function isStreamBackedVideo(row: MediaRow): boolean {
  return row.mediaType === "video" && row.processingProvider === "stream";
}

function isStreamPublished(row: MediaRow): boolean {
  return (
    isStreamBackedVideo(row) &&
    row.status === "published" &&
    row.streamUid != null
  );
}

function mapProcessingError(
  row: MediaRow,
): MediaItemDTO["processingError"] {
  if (row.status !== "failed" || !row.processingErrorCode) return null;
  const code = row.processingErrorCode as MediaProcessingErrorCode;
  return {
    code,
    message: row.processingErrorMessage ?? PROCESSING_ERROR_MESSAGE,
  };
}

function mapDeliveryUrl(row: MediaRow): string | null {
  if (row.mediaType === "link") return row.externalUrl;
  if (row.mediaType === "video" && isStreamBackedVideo(row)) {
    return mediaOriginalUrl(row.id);
  }
  return mediaDeliveryUrl(row.id);
}

function mapThumbUrl(row: MediaRow): string | null {
  if (isStreamPublished(row)) return mediaThumbnailApiUrl(row.id);
  if (row.thumbKey) return mediaThumbUrl(row.id);
  return null;
}

function mapPlaybackUrl(row: MediaRow): string | null {
  if (isStreamPublished(row)) return mediaPlaybackApiUrl(row.id);
  return null;
}

function mapPlayable(row: MediaRow): boolean {
  if (row.mediaType === "photo") return true;
  if (isStreamPlayable(row.mediaType, row.status, row.processingProvider, row.streamUid)) {
    return true;
  }
  if (isStreamBackedVideo(row) && row.status !== "published") {
    return false;
  }
  return isInlinePlayable(row.mediaType, row.mimeType, row.videoCodec);
}

export function toMediaItemDTO(
  row: MediaRow,
  event?: { slug: string | null; title: string | null },
  people: { id: number; displayName: string }[] = [],
): MediaItemDTO {
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
    url: mapDeliveryUrl(row),
    thumbUrl: mapThumbUrl(row),
    playbackUrl: mapPlaybackUrl(row),
    playable: mapPlayable(row),
    processingError: mapProcessingError(row),
    people,
  };
}

export function isVideoInFlight(row: MediaRow): boolean {
  return (
    row.mediaType === "video" &&
    !row.isDeleted &&
    (row.status === "uploading" ||
      row.status === "uploaded" ||
      row.status === "processing" ||
      row.status === "failed")
  );
}
