import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { invites, users } from "../../src/server/db/schema";
import { hashInviteToken } from "../../src/server/lib/inviteToken";
import type { ApiResponse } from "../../src/shared/types";
import type { InviteDTO, InviteVerifyDTO } from "../../src/shared/dto";

function mockInviteOutboundFetch(): void {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );

      if (url === "https://api.resend.com/emails" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "test-resend-message-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch in invites test: ${url}`);
    },
  );
}

describe("admin invites", () => {
  beforeEach(async () => {
    mockInviteOutboundFetch();
    const db = getDb(env);
    await db.delete(invites);
    await db.delete(users);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an invite as the dev editor", async () => {
    const res = await app.request(
      "/api/admin/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Alex",
          email: "alex@example.com",
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<InviteDTO>;
    expect(body.data?.email).toBe("alex@example.com");
    expect(body.data?.inviteeName).toBe("Alex");
    expect(body.data?.status).toBe("sent");

    const rows = await getDb(env).select().from(invites);
    expect(rows).toHaveLength(1);
  });

  it("rejects inviting an existing user", async () => {
    await getDb(env)
      .insert(users)
      .values({ email: "member@band.test", role: "member" });

    const res = await app.request(
      "/api/admin/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Member",
          email: "member@band.test",
        }),
      },
      env,
    );

    expect(res.status).toBe(409);
  });

  it("rejects a second invite to the same email within 24 hours", async () => {
    const payload = {
      method: "POST" as const,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alex",
        email: "alex@example.com",
      }),
    };

    const first = await app.request("/api/admin/invites", payload, env);
    expect(first.status).toBe(201);

    const second = await app.request("/api/admin/invites", payload, env);
    expect(second.status).toBe(429);
  });

  it("forbids non-editors from sending invites", async () => {
    await getDb(env)
      .insert(users)
      .values({ email: "member@band.test", role: "member" });

    const res = await app.request(
      "/api/admin/invites",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cf-Access-Authenticated-User-Email": "member@band.test",
        },
        body: JSON.stringify({
          name: "Alex",
          email: "alex@example.com",
        }),
      },
      env,
    );

    expect(res.status).toBe(403);
  });

  it("lists invites for editors", async () => {
    await app.request(
      "/api/admin/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Alex",
          email: "alex@example.com",
        }),
      },
      env,
    );

    const res = await app.request("/api/admin/invites", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ results: InviteDTO[] }>;
    expect(body.data?.results).toHaveLength(1);
  });
});

describe("invite verification", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(invites);
    await db.delete(users);
  });

  it("verifies a valid invite token", async () => {
    const db = getDb(env);
    const editor = await db
      .insert(users)
      .values({ email: "editor@band.test", role: "editor" })
      .returning()
      .get();

    const rawToken = "11111111-2222-4333-8444-555555555555";
    const tokenHash = await hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db.insert(invites).values({
      email: "alex@example.com",
      inviteeName: "Alex",
      invitedBy: editor.id,
      tokenHash,
      tokenExpiresAt: expiresAt,
      status: "sent",
    });

    const res = await app.request(
      `/api/invites/verify?token=${encodeURIComponent(rawToken)}`,
      {},
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<InviteVerifyDTO>;
    expect(body.data?.valid).toBe(true);
    expect(body.data?.inviteeName).toBe("Alex");
  });

  it("rejects an expired invite token", async () => {
    const db = getDb(env);
    const editor = await db
      .insert(users)
      .values({ email: "editor@band.test", role: "editor" })
      .returning()
      .get();

    const rawToken = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const tokenHash = await hashInviteToken(rawToken);

    await db.insert(invites).values({
      email: "alex@example.com",
      inviteeName: "Alex",
      invitedBy: editor.id,
      tokenHash,
      tokenExpiresAt: "2000-01-01T00:00:00.000Z",
      status: "sent",
    });

    const res = await app.request(
      `/api/invites/verify?token=${encodeURIComponent(rawToken)}`,
      {},
      env,
    );

    expect(res.status).toBe(404);
  });
});
