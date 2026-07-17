import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAccessEmail } from "../../src/server/auth/access";
import type { AppConfig } from "../../src/server/lib/config";

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const config: AppConfig = {
  archiveYearsActive: { start: 2009, end: 2016 },
  accessEnforced: true,
  accessTeamDomain: "team.cloudflareaccess.com",
  accessAud: "aud-tag",
  accessAccountId: "",
  accessPolicyId: "",
  devUserEmail: null,
  devUserRole: null,
  appBaseUrl: "https://archive.test",
  appAllowedOrigin: "https://archive.test",
  inviteFromEmail: "invites@archive.test",
  inviteTokenTtlDays: 7,
  inviteThrottleHours: 24,
  uploadLimits: { photo: 1, audio: 1, video: 1, document: 1 },
  presignTtlSeconds: 900,
  streamIngestPresignTtlSeconds: 3600,
  streamPlaybackTokenTtlSeconds: 1800,
  streamProcessingMaxAttempts: 3,
  streamProcessingTimeoutHours: 24,
  streamMaxDurationSeconds: 14_400,
  allowedMimeTypes: { photo: [], video: [], audio: [], document: [] },
  inlinePlayback: { audio: [], video: [] },
};

describe("verifyAccessEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no token is present", async () => {
    const req = new Request("https://archive.test/api/me");
    expect(await verifyAccessEmail(req, config)).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    const req = new Request("https://archive.test/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "not.a.jwt" },
    });
    expect(await verifyAccessEmail(req, config)).toBeNull();
  });

  it("returns null when the team domain is not configured", async () => {
    const req = new Request("https://archive.test/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "a.b.c" },
    });
    expect(
      await verifyAccessEmail(req, { ...config, accessTeamDomain: "" }),
    ).toBeNull();
  });

  it("caches JWKS so repeated lookups do not refetch certs", async () => {
    const jwksConfig: AppConfig = {
      ...config,
      accessTeamDomain: "jwks-cache-test.cloudflareaccess.com",
    };
    const jwk = {
      kid: "kid-1",
      kty: "RSA",
      alg: "RS256",
      n: "0vx7agoebGcQSuuPiLJXZptN9nndrTcr19lunKDWPzTKT3Zs9M8R00jhxU8Q_EWLWXWBhWTde6GSMMYwt1AcnX4JYKVZU-VUfEQ5d3BB7CfqF-1f3B9_TRu0wQ41q5JgPfHS_X6JQlB2IJdpDzHXElXl5KZFx2hxXVb2OVZIkpFSys-WUkTpR76_X4spmwMjAkZhQyneoUfhiT8fv8Vvz9OJp_0-K0GsQQ9CzA-Nds_TRd3s7fM41nQZHH3M39wqM3ouU_Salawyuc2Uo29YarsIuwIxv_OuWFcn8AJO50dO8AgBeScheGKoSx_MJpzoPRAkCXdhbEbCpXB7-CWbFkca6e7fTw",
      e: "AQAB",
    };
    let fetches = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/cdn-cgi/access/certs")) {
        fetches++;
        return Response.json({ keys: [jwk] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const token = [
      b64url({ alg: "RS256", kid: "kid-1" }),
      b64url({ email: "member@example.com", aud: "aud-tag" }),
      b64urlBytes(new Uint8Array(32)),
    ].join(".");
    const req = new Request("https://archive.test/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });

    await verifyAccessEmail(req, jwksConfig);
    await verifyAccessEmail(req, jwksConfig);
    expect(fetches).toBe(1);
  });
});
