import type { Env } from "../env";
import { getConfig } from "../lib/config";
import { badRequest } from "../lib/errors";
import type { media } from "../db/schema";
import { createStreamVideoService } from "./stream";
import type { VideoPlaybackDTO } from "@shared/dto";
import { mediaThumbnailApiUrl } from "./url";

type MediaRow = typeof media.$inferSelect;

export async function buildVideoPlayback(
  env: Env,
  row: MediaRow,
): Promise<VideoPlaybackDTO> {
  if (row.mediaType !== "video") {
    throw badRequest("Playback is only available for videos.");
  }
  if (row.status !== "published" || !row.streamUid) {
    throw badRequest("Video is not ready for playback.");
  }

  const customerCode = env.STREAM_CUSTOMER_CODE;
  if (!customerCode) {
    throw badRequest("Stream playback is not configured.");
  }

  const config = getConfig(env);
  const stream = createStreamVideoService(env);
  const token = await stream.createPlaybackToken(row.streamUid);

  const expiresOn = new Date(
    Date.now() + config.streamPlaybackTokenTtlSeconds * 1000,
  ).toISOString();

  return {
    provider: "cloudflare-stream",
    token,
    customerCode,
    expiresOn,
    posterUrl: mediaThumbnailApiUrl(row.id),
  };
}

export function streamIframeUrl(token: string): string {
  return `https://iframe.cloudflarestream.com/${token}`;
}

export function streamThumbnailUrl(
  customerCode: string,
  token: string,
): string {
  // With requireSignedURLs, the token replaces the video UID in the path.
  return `https://customer-${customerCode}.cloudflarestream.com/${token}/thumbnails/thumbnail.jpg`;
}
