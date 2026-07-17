import { describe, expect, it } from "vitest";
import {
  mapStreamErrorCode,
  verifyStreamWebhook,
} from "../../src/server/media/webhook";

async function signBody(secret: string, body: string, time: number) {
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
    new TextEncoder().encode(`${time}.${body}`),
  );
  const sig1 = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `time=${time},sig1=${sig1}`;
}

describe("verifyStreamWebhook", () => {
  it("accepts a valid signature within the replay window", async () => {
    const secret = "test-secret";
    const body = JSON.stringify({
      uid: "abc123",
      readyToStream: true,
      status: { state: "ready" },
    });
    const time = Math.floor(Date.now() / 1000);
    const header = await signBody(secret, body, time);

    const event = await verifyStreamWebhook(body, header, secret);
    expect(event?.uid).toBe("abc123");
    expect(event?.readyToStream).toBe(true);
  });

  it("rejects stale signatures", async () => {
    const secret = "test-secret";
    const body = JSON.stringify({ uid: "abc123" });
    const time = Math.floor(Date.now() / 1000) - 600;
    const header = await signBody(secret, body, time);

    const event = await verifyStreamWebhook(body, header, secret);
    expect(event).toBeNull();
  });

  it("rejects invalid signatures", async () => {
    const body = JSON.stringify({ uid: "abc123" });
    const time = Math.floor(Date.now() / 1000);
    const event = await verifyStreamWebhook(
      body,
      `time=${time},sig1=deadbeef`,
      "test-secret",
    );
    expect(event).toBeNull();
  });
});

describe("mapStreamErrorCode", () => {
  it("maps ingest failures", () => {
    expect(mapStreamErrorCode("ERR_DOWNLOAD")).toBe("STREAM_INGEST_FAILED");
  });

  it("maps generic processing failures", () => {
    expect(mapStreamErrorCode("ERR_ENCODE")).toBe("STREAM_PROCESSING_FAILED");
    expect(mapStreamErrorCode(null)).toBe("STREAM_PROCESSING_FAILED");
  });
});
