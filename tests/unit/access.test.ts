import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAccessLoginUrl,
  buildAccessLogoutUrl,
  tokenAudienceAllowed,
  verifyAccessEmail,
} from "../../src/server/auth/access";
import { parseCsv, type AppConfig } from "../../src/server/lib/config";

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
  accessAuds: ["aud-tag"],
  accessLoginAudiences: { "archive.test": "aud-tag" },
  accessAccountId: "",
  accessPolicyId: "",
  devUserEmail: null,
  devUserRole: null,
  appBaseUrl: "https://archive.test",
  appAllowedOrigin: "https://archive.test",
  appAllowedOrigins: ["https://archive.test"],
  inviteFromEmail: "invites@archive.test",
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

describe("buildAccessLoginUrl", () => {
  it("links directly to the configured Access app and preserves the return path", () => {
    const url = buildAccessLoginUrl(
      "https://archive.test/api/auth/login",
      "/timeline?year=2024",
      config,
    );
    expect(url).toBe(
      "https://team.cloudflareaccess.com/cdn-cgi/access/login/archive.test?kid=aud-tag&redirect_url=%2Ftimeline%3Fyear%3D2024",
    );
  });

  it("rejects unknown hosts and external return destinations", () => {
    expect(buildAccessLoginUrl("https://unknown.test/api/auth/login", "/", config)).toBeNull();
    const url = buildAccessLoginUrl(
      "https://archive.test/api/auth/login",
      "//other.example/",
      config,
    );
    expect(new URL(url!).searchParams.get("redirect_url")).toBe("/");
  });
});

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

describe("tokenAudienceAllowed", () => {
  const production =
    "d529d2a3185377e0e6b82c6abcb154962f5ee4a87533314e8113cb0d2d70263a";
  const preview =
    "00b6c453c4565e39b1ab376759e0f2816a0fe849f3aa6e7f7a9662bbd857c284";

  it("accepts either configured Access application AUD", () => {
    expect(tokenAudienceAllowed(production, [production, preview])).toBe(true);
    expect(tokenAudienceAllowed(preview, [production, preview])).toBe(true);
  });

  it("rejects an unknown AUD", () => {
    expect(tokenAudienceAllowed("other-app", [production, preview])).toBe(
      false,
    );
  });

  it("allows any audience when none are configured", () => {
    expect(tokenAudienceAllowed("anything", [])).toBe(true);
  });
});

describe("buildAccessLogoutUrl", () => {
  it("returns null when Access is not configured", () => {
    expect(
      buildAccessLogoutUrl(
        "https://www.funkafterdeath.institute/api/me",
        "",
      ),
    ).toBeNull();
  });

  it("uses the application origin instead of the team domain", () => {
    expect(
      buildAccessLogoutUrl(
        "https://www.funkafterdeath.institute/api/me",
        "wsabol-team.cloudflareaccess.com",
      ),
    ).toBe("https://www.funkafterdeath.institute/cdn-cgi/access/logout");
  });

  it("follows the preview hostname", () => {
    expect(
      buildAccessLogoutUrl(
        "https://conglomerate-cs.wsabol39.workers.dev/api/me",
        "wsabol-team.cloudflareaccess.com",
      ),
    ).toBe(
      "https://conglomerate-cs.wsabol39.workers.dev/cdn-cgi/access/logout",
    );
  });
});

describe("parseCsv", () => {
  it("splits comma-separated Access AUDs", () => {
    expect(
      parseCsv(
        "d529d2a3185377e0e6b82c6abcb154962f5ee4a87533314e8113cb0d2d70263a, 00b6c453c4565e39b1ab376759e0f2816a0fe849f3aa6e7f7a9662bbd857c284",
      ),
    ).toEqual([
      "d529d2a3185377e0e6b82c6abcb154962f5ee4a87533314e8113cb0d2d70263a",
      "00b6c453c4565e39b1ab376759e0f2816a0fe849f3aa6e7f7a9662bbd857c284",
    ]);
  });
});
