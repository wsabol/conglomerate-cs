import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import type { AccessLoginDTO } from "../../src/shared/dto";
import type { ApiResponse } from "../../src/shared/types";
import type { Env } from "../../src/server/env";

describe("public Access login URL", () => {
  it("returns an envelope with the protected destination without an identity", async () => {
    const response = await app.request(
      "/api/auth/login?next=%2Ftimeline%3Fyear%3D2024",
      {},
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await response.json()) as ApiResponse<AccessLoginDTO>;
    expect(body.data?.url).toBe("http://localhost:5173/timeline?year=2024");
    expect(body.data?.localDevAuth).toBe(true);
  });

  it("never enables the dev bypass for the production Access app", async () => {
    const productionEnv = {
      ...env,
      ENVIRONMENT: "production",
      ACCESS_ENFORCED: "true",
      ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      ACCESS_AUD: "aud-tag",
      ACCESS_LOGIN_AUDIENCES: "archive.test=aud-tag",
    } as Env;
    const response = await app.request(
      "https://archive.test/api/auth/login?next=%2F",
      {},
      productionEnv,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiResponse<AccessLoginDTO>;
    expect(body.data?.localDevAuth).toBe(false);
    expect(body.data?.url).toContain("team.cloudflareaccess.com/cdn-cgi/access/login/");
  });
});
