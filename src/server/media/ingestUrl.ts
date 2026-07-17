import type { Env } from "../env";
import { getConfig } from "../lib/config";
import { createPresignedGetUrl } from "./presign";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hasR2S3Credentials(env: Env): boolean {
  return Boolean(
    env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_ACCOUNT_ID &&
      env.R2_BUCKET_NAME,
  );
}

/** Short-lived Worker URL Stream can fetch without Cloudflare Access or R2 S3 API keys. */
export async function createWorkerIngestUrl(
  env: Env,
  mediaId: number,
  r2Key: string,
  ttlSeconds: number,
): Promise<string> {
  const secret = env.STREAM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STREAM_WEBHOOK_SECRET is required for Worker-mediated Stream ingestion.",
    );
  }

  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await hmacSha256Hex(secret, `${mediaId}:${r2Key}:${exp}`);
  const base = getConfig(env).appBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    exp: String(exp),
    token,
  });
  return `${base}/api/stream-ingest/${mediaId}?${params}`;
}

export async function verifyWorkerIngestToken(
  secret: string,
  mediaId: number,
  r2Key: string,
  exp: number,
  token: string,
): Promise<boolean> {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = await hmacSha256Hex(secret, `${mediaId}:${r2Key}:${exp}`);
  return timingSafeEqual(expected, token);
}

/**
 * URL passed to env.STREAM.upload(). Prefer Worker proxy in production (R2 binding);
 * fall back to presigned R2 GET when S3 credentials are available locally.
 */
export async function createStreamIngestSourceUrl(
  env: Env,
  mediaId: number,
  r2Key: string,
  ttlSeconds: number,
): Promise<string> {
  const config = getConfig(env);
  if (config.accessEnforced && env.STREAM_WEBHOOK_SECRET) {
    return createWorkerIngestUrl(env, mediaId, r2Key, ttlSeconds);
  }
  if (hasR2S3Credentials(env)) {
    return createPresignedGetUrl(env, r2Key, ttlSeconds);
  }
  if (env.STREAM_WEBHOOK_SECRET) {
    return createWorkerIngestUrl(env, mediaId, r2Key, ttlSeconds);
  }
  // Tests without secrets.
  return createPresignedGetUrl(env, r2Key, ttlSeconds);
}
