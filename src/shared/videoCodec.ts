/** Video sample-entry fourccs that play in modern browsers via HTML5 video. */
export const BROWSER_VIDEO_CODECS = new Set([
  "avc1", // H.264
  "avc3",
  "hvc1", // HEVC (Safari; Chrome on some platforms)
  "hev1",
  "av01", // AV1
  "vp09", // VP9
  "vp08", // VP8
]);

/** Sample-entry fourccs that are known not to play inline in browsers. */
export const UNSUPPORTED_VIDEO_CODECS = new Set(["mp4v", "mp4v "]);

/** Whether a sniffed video codec can play in the browser. Unknown codecs are tried optimistically. */
export function isBrowserPlayableVideoCodec(
  codec: string | null | undefined,
): boolean {
  if (!codec) return true;
  const normalized = codec.trim();
  if (UNSUPPORTED_VIDEO_CODECS.has(normalized)) return false;
  if (BROWSER_VIDEO_CODECS.has(normalized)) return true;
  return true;
}
