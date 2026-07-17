import type { MediaProcessingErrorCode } from "@shared/types";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface VerifiedStreamWebhook {
  uid: string;
  readyToStream: boolean;
  state: string;
  errorReasonCode: string | null;
  errorReasonText: string | null;
}

function parseSignatureHeader(header: string): {
  time: number;
  sig1: string;
} | null {
  const parts = header.split(",");
  let time: number | null = null;
  let sig1: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "time") time = Number(value);
    if (key === "sig1") sig1 = value;
  }

  if (!time || !sig1) return null;
  return { time, sig1 };
}

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

export async function verifyStreamWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
): Promise<VerifiedStreamWebhook | null> {
  if (!secret || !signatureHeader) return null;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.time) > WEBHOOK_TOLERANCE_SECONDS) return null;

  const signedPayload = `${parsed.time}.${rawBody}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  if (!timingSafeEqual(expected, parsed.sig1)) return null;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }

  const uid = typeof body.uid === "string" ? body.uid : null;
  if (!uid) return null;

  const status =
    body.status && typeof body.status === "object"
      ? (body.status as Record<string, unknown>)
      : {};

  return {
    uid,
    readyToStream: body.readyToStream === true,
    state: typeof status.state === "string" ? status.state : "unknown",
    errorReasonCode:
      typeof status.errorReasonCode === "string" ? status.errorReasonCode : null,
    errorReasonText:
      typeof status.errorReasonText === "string" ? status.errorReasonText : null,
  };
}

export function mapStreamErrorCode(
  providerCode: string | null,
): MediaProcessingErrorCode {
  if (!providerCode) return "STREAM_PROCESSING_FAILED";
  const normalized = providerCode.toLowerCase();
  if (normalized.includes("download") || normalized.includes("ingest")) {
    return "STREAM_INGEST_FAILED";
  }
  return "STREAM_PROCESSING_FAILED";
}

export const PROCESSING_FAILURE_MESSAGE =
  "This video could not be prepared for playback. The original file is still safely stored.";
