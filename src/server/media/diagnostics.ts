import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import type { Env } from "../env";
import { getConfig } from "../lib/config";
import {
  resolveStreamIngestMethod,
  sanitizeIngestErrorText,
  type StreamIngestMethod,
} from "./ingestErrors";
import { notFound } from "../lib/errors";

export interface MediaProcessingDiagnostics {
  mediaId: number;
  status: string;
  sizeBytes: number | null;
  processingAttempts: number;
  ingestPath: StreamIngestMethod;
  error: {
    code: string | null;
    message: string | null;
  };
  configuration: {
    accessEnforced: boolean;
    streamWebhookSecretSet: boolean;
    streamCustomerCodeSet: boolean;
    r2S3CredentialsSet: boolean;
    appBaseUrl: string;
    streamMaxDurationSeconds: number;
  };
  storage: {
    r2Key: string | null;
    objectExists: boolean;
    objectSizeBytes: number | null;
  };
  streamBinding: {
    probe: "ok" | "failed" | "skipped";
    probeError: string | null;
  };
  troubleshooting: string[];
}

function hasR2S3Credentials(env: Env): boolean {
  return Boolean(
    env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_ACCOUNT_ID &&
      env.R2_BUCKET_NAME,
  );
}

export async function getMediaProcessingDiagnostics(
  env: Env,
  db: Db,
  mediaId: number,
): Promise<MediaProcessingDiagnostics> {
  const row = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .get();
  if (!row || row.isDeleted) throw notFound("Media not found.");

  const config = getConfig(env);
  const sizeBytes = row.size ?? null;
  const ingestPath = resolveStreamIngestMethod(sizeBytes ?? 0);

  let objectExists = false;
  let objectSizeBytes: number | null = null;
  if (row.r2Key) {
    const object = await env.MEDIA.head(row.r2Key);
    objectExists = object != null;
    objectSizeBytes = object?.size ?? null;
  }

  let probe: MediaProcessingDiagnostics["streamBinding"]["probe"] = "skipped";
  let probeError: string | null = null;
  if (row.mediaType === "video" && env.STREAM) {
    try {
      await env.STREAM.createDirectUpload({
        maxDurationSeconds: 60,
      });
      probe = "ok";
    } catch (err) {
      probe = "failed";
      probeError = sanitizeIngestErrorText(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const troubleshooting: string[] = [
    "Check Workers observability logs for JSON lines with type=media_processing and operation=stream_ingest_failed.",
  ];

  if (!objectExists) {
    troubleshooting.push("R2 object is missing — re-upload the original file.");
  }

  if (probe === "failed") {
    troubleshooting.push(
      `Stream binding probe failed: ${probeError ?? "unknown"}. Verify the [stream] binding in wrangler.toml and Stream is enabled on the account.`,
    );
  }

  if (ingestPath === "direct_upload") {
    troubleshooting.push(
      `This file (${formatMb(sizeBytes ?? objectSizeBytes ?? 0)} MB) uses direct R2→Stream upload. It does not need /api/stream-ingest Access bypass.`,
    );
  } else {
    troubleshooting.push(
      "Files over 200 MB use copy-by-URL ingest. Add an Access bypass for GET /api/stream-ingest/* and set STREAM_WEBHOOK_SECRET.",
    );
  }

  if (config.accessEnforced && ingestPath === "copy_by_url" && !env.STREAM_WEBHOOK_SECRET) {
    troubleshooting.push("STREAM_WEBHOOK_SECRET is not set — large-file ingest cannot build a signed Worker URL.");
  }

  if (!env.STREAM_CUSTOMER_CODE) {
    troubleshooting.push(
      "STREAM_CUSTOMER_CODE is not set — playback may fail even after ingest succeeds.",
    );
  }

  if (row.processingErrorMessage) {
    troubleshooting.push(`Last stored error: ${row.processingErrorMessage}`);
  }

  return {
    mediaId: row.id,
    status: row.status,
    sizeBytes,
    processingAttempts: row.processingAttempts,
    ingestPath,
    error: {
      code: row.processingErrorCode,
      message: row.processingErrorMessage,
    },
    configuration: {
      accessEnforced: config.accessEnforced,
      streamWebhookSecretSet: Boolean(env.STREAM_WEBHOOK_SECRET),
      streamCustomerCodeSet: Boolean(env.STREAM_CUSTOMER_CODE),
      r2S3CredentialsSet: hasR2S3Credentials(env),
      appBaseUrl: config.appBaseUrl,
      streamMaxDurationSeconds: config.streamMaxDurationSeconds,
    },
    storage: {
      r2Key: row.r2Key,
      objectExists,
      objectSizeBytes,
    },
    streamBinding: {
      probe,
      probeError,
    },
    troubleshooting,
  };
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
