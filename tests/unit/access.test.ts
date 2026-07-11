import { describe, expect, it } from "vitest";
import { verifyAccessEmail } from "../../src/server/auth/access";
import type { AppConfig } from "../../src/server/lib/config";

const config: AppConfig = {
  archiveYearsActive: { start: 2009, end: 2016 },
  accessEnforced: true,
  accessTeamDomain: "team.cloudflareaccess.com",
  accessAud: "aud-tag",
  devUserEmail: null,
  devUserRole: null,
  uploadLimits: { photo: 1, audio: 1, video: 1, document: 1 },
  presignTtlSeconds: 900,
  allowedMimeTypes: { photo: [], video: [], audio: [], document: [] },
  inlinePlayback: { audio: [], video: [] },
};

describe("verifyAccessEmail", () => {
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
});
