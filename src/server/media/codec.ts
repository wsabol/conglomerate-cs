import { isBrowserPlayableVideoCodec } from "@shared/videoCodec";

const TAIL_BYTES = 5_000_000;

export const VIDEO_CODEC_SNIFF_BYTES = TAIL_BYTES;

const VIDEO_FOURCC_PRIORITY = [
  "avc1",
  "avc3",
  "hvc1",
  "hev1",
  "av01",
  "vp09",
  "vp08",
  "mp4v",
] as const;

/** Scan the moov/stsd region for a video sample-entry fourcc. */
export function sniffVideoCodec(buffer: ArrayBuffer): string | null {
  const slice =
    buffer.byteLength > TAIL_BYTES
      ? buffer.slice(buffer.byteLength - TAIL_BYTES)
      : buffer;
  const text = new TextDecoder("latin1").decode(slice);

  for (const codec of VIDEO_FOURCC_PRIORITY) {
    if (text.includes(codec)) return codec.trim();
  }

  return null;
}

/** Read only the tail of a large R2 object to sniff the video codec. */
export async function sniffVideoCodecFromR2(
  bucket: R2Bucket,
  key: string,
  size: number,
): Promise<string | null> {
  const length = Math.min(TAIL_BYTES, size);
  if (length <= 0) return null;
  const offset = Math.max(0, size - length);
  const object = await bucket.get(key, { range: { offset, length } });
  if (!object) return null;
  return sniffVideoCodec(await object.arrayBuffer());
}

export function isUploadedVideoPlayable(
  mime: string | null | undefined,
  videoCodec: string | null | undefined,
): boolean {
  if (!mime) return false;
  if (!mime.startsWith("video/")) return false;
  return isBrowserPlayableVideoCodec(videoCodec);
}
