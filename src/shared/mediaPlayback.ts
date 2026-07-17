import type { MediaType } from "./types";
import { isBrowserPlayableVideoCodec } from "./videoCodec";

/** MIME types that support inline browser playback per media category. */
export const INLINE_PLAYBACK_MIMES = {
  audio: [
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/x-m4a",
    "audio/wav",
  ],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

/** Whether a media item can be played inline in the browser. */
export function isInlinePlayable(
  mediaType: MediaType,
  mime: string | null | undefined,
  videoCodec?: string | null,
): boolean {
  if (mediaType === "photo") return true;
  if (!mime) return false;
  if (mediaType === "video") {
    if (!(INLINE_PLAYBACK_MIMES.video as readonly string[]).includes(mime)) {
      return false;
    }
    return isBrowserPlayableVideoCodec(videoCodec);
  }
  if (mediaType === "audio") {
    return (INLINE_PLAYBACK_MIMES.audio as readonly string[]).includes(mime);
  }
  return false;
}
