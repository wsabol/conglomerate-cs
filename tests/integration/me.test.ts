import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import type { ApiResponse } from "../../src/shared/types";

interface MeDTO {
  id: number;
  email: string;
  role: string;
  displayName: string;
}

describe("GET /api/me", () => {
  beforeEach(async () => {
    await getDb(env).delete(users);
  });

  it("falls back to the dev identity as editor", async () => {
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<MeDTO>;
    expect(body.data?.email).toBe("dev@theconglomerate.local");
    expect(body.data?.role).toBe("editor");
  });

  it("resolves a known user's role from the database via the Access header", async () => {
    await getDb(env)
      .insert(users)
      .values({ email: "member@band.test", role: "member" });

    const res = await app.request(
      "/api/me",
      { headers: { "Cf-Access-Authenticated-User-Email": "member@band.test" } },
      env,
    );
    const body = (await res.json()) as ApiResponse<MeDTO>;
    expect(body.data?.role).toBe("member");
    expect(body.data?.email).toBe("member@band.test");
    expect(body.data?.id).toBeGreaterThan(0);
  });
});
