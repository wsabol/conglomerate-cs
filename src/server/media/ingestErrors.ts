import type { MediaProcessingErrorCode } from "@shared/types";

const GENERIC_INGEST_MESSAGE =
  "Video ingestion failed. The original file is still safely stored.";

/** Strip URLs and secrets before persisting or returning ingest errors. */
export function sanitizeIngestErrorText(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function streamIngestErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const streamErr = err as {
      message?: string;
      errors?: Array<{ message?: string; code?: number }>;
    };
    if (Array.isArray(streamErr.errors) && streamErr.errors.length > 0) {
      return streamErr.errors
        .map((e) => e.message ?? `Stream error ${e.code ?? "unknown"}`)
        .join("; ");
    }
    if (typeof streamErr.message === "string" && streamErr.message) {
      return streamErr.message;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export type StreamIngestMethod = "direct_upload" | "copy_by_url";

export function resolveStreamIngestMethod(sizeBytes: number): StreamIngestMethod {
  const directUploadMaxBytes = 200 * 1024 * 1024;
  return sizeBytes < directUploadMaxBytes ? "direct_upload" : "copy_by_url";
}

export interface ClassifiedIngestError {
  code: MediaProcessingErrorCode;
  message: string;
  method?: StreamIngestMethod;
}

/** Map a thrown ingest error to a safe, actionable message for editors. */
export function classifyStreamIngestError(
  err: unknown,
  context?: { method?: StreamIngestMethod; sizeBytes?: number },
): ClassifiedIngestError {
  const raw = streamIngestErrorMessage(err);
  const lower = raw.toLowerCase();

  if (lower.includes("allowed origin must not specify protocol")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "Stream allowedOrigins misconfigured: use hostname only (no https://). Deploy the latest Worker fix.",
      method: context?.method,
    };
  }

  if (lower.includes("stream_webhook_secret is required")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "Large-video ingest is misconfigured: STREAM_WEBHOOK_SECRET is missing. Add it with wrangler secret put --env production.",
      method: context?.method,
    };
  }

  if (lower.includes("stream-ingest.local")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "Ingest URL misconfigured (placeholder host). Deploy the latest Worker or set STREAM_WEBHOOK_SECRET / R2 S3 credentials.",
      method: context?.method,
    };
  }

  if (lower.includes("original file not found")) {
    return {
      code: "ORIGINAL_ASSET_MISSING",
      message: "Original file is missing from R2 storage.",
      method: context?.method,
    };
  }

  if (
    lower.includes("maxfilesize") ||
    lower.includes("too large") ||
    lower.includes("file size")
  ) {
    return {
      code: "STREAM_INGEST_FAILED",
      message: `File exceeds Stream upload limits.${context?.sizeBytes ? ` (${formatMb(context.sizeBytes)} MB)` : ""}`,
      method: context?.method,
    };
  }

  if (lower.includes("direct upload failed (401)")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "Stream rejected the direct upload (401). Check Stream is enabled on this account and the Worker Stream binding is configured.",
      method: "direct_upload",
    };
  }

  if (lower.includes("direct upload failed (403)")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "Stream rejected the direct upload (403). This may be quota, billing, or account permission related.",
      method: "direct_upload",
    };
  }

  if (lower.includes("direct upload failed (413)")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "File is too large for Stream basic direct upload (200 MB max). Large-file copy-by-URL ingest requires /api/stream-ingest/* Access bypass.",
      method: "direct_upload",
    };
  }

  if (
    context?.method === "copy_by_url" &&
    (lower.includes("badrequest") ||
      lower.includes("invalid url") ||
      lower.includes("could not fetch") ||
      lower.includes("download"))
  ) {
    return {
      code: "STREAM_INGEST_FAILED",
      message:
        "Stream could not fetch the ingest URL. Add an Access bypass for GET /api/stream-ingest/* or verify STREAM_WEBHOOK_SECRET.",
      method: "copy_by_url",
    };
  }

  if (lower.includes("quota") || lower.includes("storage")) {
    return {
      code: "STREAM_INGEST_FAILED",
      message: "Stream storage quota reached. Check your Stream plan in the Cloudflare dashboard.",
      method: context?.method,
    };
  }

  const sanitized = sanitizeIngestErrorText(raw);
  if (sanitized) {
    return {
      code: "STREAM_INGEST_FAILED",
      message: sanitized,
      method: context?.method,
    };
  }

  return {
    code: "STREAM_INGEST_FAILED",
    message: GENERIC_INGEST_MESSAGE,
    method: context?.method,
  };
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export { GENERIC_INGEST_MESSAGE };
