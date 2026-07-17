/** MIME types accepted per upload category (shared by client validation and server config). */
export const UPLOAD_MIME_CATEGORIES = {
  photo: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
  ],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: [
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
  ],
  document: ["application/pdf"],
} as const;

export type UploadCategory = keyof typeof UPLOAD_MIME_CATEGORIES;

const MB = 1024 * 1024;

/** Default per-category byte limits (overridable via Worker env vars). */
export const DEFAULT_UPLOAD_LIMIT_BYTES: Record<UploadCategory, number> = {
  photo: 25 * MB,
  audio: 500 * MB,
  /** Cloudflare Stream direct-upload maximum; larger files are not supported. */
  video: 200 * MB,
  document: 100 * MB,
};

const CATEGORY_LABEL: Record<UploadCategory, string> = {
  photo: "Photos",
  audio: "Audio",
  video: "Videos",
  document: "PDFs",
};

export const UPLOAD_LIMIT_HINT =
  "Max size per file: photos 25 MB, videos 200 MB, audio 500 MB, PDFs 100 MB.";

export function formatFileSize(bytes: number): string {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return Number.isInteger(kb) ? `${kb} KB` : `${kb.toFixed(1)} KB`;
}

export function uploadCategoryForMime(mime: string): UploadCategory | null {
  const normalized = mime.split(";")[0]!.trim().toLowerCase();
  for (const [category, list] of Object.entries(UPLOAD_MIME_CATEGORIES)) {
    if ((list as readonly string[]).includes(normalized)) {
      return category as UploadCategory;
    }
  }
  return null;
}

export function uploadSizeExceededMessage(
  category: UploadCategory,
  limitBytes: number,
  actualBytes: number,
  filename?: string,
): string {
  const label = CATEGORY_LABEL[category];
  const limit = formatFileSize(limitBytes);
  const actual = formatFileSize(actualBytes);
  const name = filename ? ` (“${filename}”)` : "";
  return `${label} must be ${limit} or smaller${name}. This file is ${actual}.`;
}

export function unsupportedUploadTypeMessage(filename?: string): string {
  const name = filename ? ` “${filename}”` : " This file";
  return `${name.trim()} is not a supported type. Use photos, videos, audio, or PDF.`;
}

/** Client-side preflight; returns an error message or null when the file is allowed. */
export function validateUploadFileSize(
  file: { size: number; type: string; name?: string },
  limits: Record<UploadCategory, number> = DEFAULT_UPLOAD_LIMIT_BYTES,
): string | null {
  const category = uploadCategoryForMime(file.type || "");
  if (!category) {
    return unsupportedUploadTypeMessage(file.name);
  }
  const limit = limits[category];
  if (file.size > limit) {
    return uploadSizeExceededMessage(category, limit, file.size, file.name);
  }
  return null;
}
