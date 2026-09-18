import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { people, users } from "../../src/server/db/schema";
import type { Env } from "../../src/server/env";
import type { ApiResponse } from "../../src/shared/types";

interface MeDTO {
  id: number;
  email: string;
  role: string;
  displayName: string;
  instrument: string | null;
  logoutUrl: string | null;
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
    expect(body.data?.instrument).toBeNull();
    expect(body.data?.logoutUrl).toBeNull();
  });

  it("returns instrument from the linked person", async () => {
    const person = await getDb(env)
      .insert(people)
      .values({ displayName: "Will", instrument: "Drums" })
      .returning()
      .get();
    await getDb(env)
      .insert(users)
      .values({
        email: "will@band.test",
        role: "member",
        personId: person.id,
      });

    const res = await app.request(
      "/api/me",
      { headers: { "Cf-Access-Authenticated-User-Email": "will@band.test" } },
      env,
    );
    const body = (await res.json()) as ApiResponse<MeDTO>;
    expect(body.data?.displayName).toBe("Will");
    expect(body.data?.instrument).toBe("Drums");
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

  it("returns an application-host Access logout URL", async () => {
    const accessEnv = {
      ...env,
      ACCESS_TEAM_DOMAIN: "wsabol-team.cloudflareaccess.com",
    } as unknown as Env;

    const res = await app.request(
      "https://www.funkafterdeath.institute/api/me",
      {},
      accessEnv,
    );
    const body = (await res.json()) as ApiResponse<MeDTO>;
    expect(body.data?.logoutUrl).toBe(
      "https://www.funkafterdeath.institute/cdn-cgi/access/logout",
    );
  });
});
