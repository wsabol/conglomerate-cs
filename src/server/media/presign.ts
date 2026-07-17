import { AwsClient } from "aws4fetch";
import type { Env } from "../env";
import { getConfig } from "../lib/config";

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** When false, upload through the Worker proxy instead. */
  direct: boolean;
}

/** Return a short-lived presigned PUT URL, or a Worker proxy URL for local dev. */
export async function createUploadTarget(
  env: Env,
  key: string,
  mimeType: string,
  mediaId: number,
): Promise<PresignedUpload> {
  const { presignTtlSeconds } = getConfig(env);

  if (
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET_NAME
  ) {
    const endpoint =
      env.R2_ENDPOINT ??
      `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const url = new URL(
      `${endpoint.replace(/\/$/, "")}/${env.R2_BUCKET_NAME}/${key}`,
    );
    url.searchParams.set("X-Amz-Expires", String(presignTtlSeconds));

    const client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });

    const signed = await client.sign(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      aws: { signQuery: true },
    });

    return { url: signed.url, method: "PUT", direct: true };
  }

  // Local dev fallback: upload through the Worker to the R2 binding.
  // Use a same-origin relative path so Vite's proxy (or the ASSETS binding)
  // handles the PUT without a cross-origin preflight.
  return {
    url: `/api/uploads/${mediaId}/body`,
    method: "PUT",
    direct: false,
  };
}

/** Return a short-lived presigned GET URL for a single R2 object. */
export async function createPresignedGetUrl(
  env: Env,
  key: string,
  ttlSeconds: number,
): Promise<string> {
  if (
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_ACCOUNT_ID ||
    !env.R2_BUCKET_NAME
  ) {
    // Tests and local dev without S3 credentials use a placeholder URL.
    // Stream ingestion in production requires real presigned GET URLs.
    return `https://stream-ingest.local/${key}`;
  }

  const endpoint =
    env.R2_ENDPOINT ??
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = new URL(
    `${endpoint.replace(/\/$/, "")}/${env.R2_BUCKET_NAME}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));

  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const signed = await client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });

  return signed.url;
}

/** Resolve which R2 key to serve for a variant query param. */
export function resolveMediaKey(
  row: {
    r2Key: string | null;
    displayKey: string | null;
    thumbKey: string | null;
    mediaType?: string;
    processingProvider?: string | null;
  },
  variant: string | null,
): string | null {
  if (variant === "original") return row.r2Key;
  if (variant === "thumb") return row.thumbKey ?? row.displayKey ?? row.r2Key;
  if (variant === "display") return row.displayKey ?? row.r2Key;
  if (row.mediaType === "video" && row.processingProvider === "stream") {
    return null;
  }
  return row.r2Key;
}
