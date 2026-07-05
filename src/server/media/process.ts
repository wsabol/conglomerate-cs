import type { Env } from "../env";
import { mediaObjectKey } from "./keys";

/**
 * Minimal image post-processing for MVP: copy the original into display and
 * thumb keys. Full resize/orientation correction can replace this later.
 */
export async function finalizeImageVariants(
  bucket: Env["MEDIA"],
  mediaId: number,
  originalKey: string,
  mimeType: string,
): Promise<{ displayKey: string; thumbKey: string }> {
  const object = await bucket.get(originalKey);
  if (!object) {
    return { displayKey: originalKey, thumbKey: originalKey };
  }

  const displayKey = mediaObjectKey(mediaId, "image", "display");
  const thumbKey = mediaObjectKey(mediaId, "image", "thumb");

  const buffer = await object.arrayBuffer();
  const httpMetadata = {
    contentType: mimeType,
    cacheControl: "private, max-age=31536000",
  };

  await bucket.put(displayKey, buffer, { httpMetadata });
  await bucket.put(thumbKey, buffer, { httpMetadata });

  return { displayKey, thumbKey };
}

/** Whether a MIME type is an image we derive variants for. */
export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}
