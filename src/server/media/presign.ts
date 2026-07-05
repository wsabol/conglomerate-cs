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
  origin: string,
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
  return {
    url: `${origin}/api/uploads/${mediaId}/body`,
    method: "PUT",
    direct: false,
  };
}

/** Resolve which R2 key to serve for a variant query param. */
export function resolveMediaKey(
  row: {
    r2Key: string | null;
    displayKey: string | null;
    thumbKey: string | null;
  },
  variant: string | null,
): string | null {
  if (variant === "thumb") return row.thumbKey ?? row.displayKey ?? row.r2Key;
  if (variant === "display") return row.displayKey ?? row.r2Key;
  return row.r2Key;
}
