import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { invites, users } from "../../src/server/db/schema";
import type { ApiResponse } from "../../src/shared/types";
import type { InviteDTO } from "../../src/shared/dto";

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
        const message = JSON.parse(String(init.body)) as { html: string; text: string };
        expect(message.html).toContain('href="http://localhost:5173/welcome"');
        expect(message.text).toContain("http://localhost:5173/welcome");
        expect(message.text).not.toContain("?token=");
        expect(message.text).not.toContain("expires in seven days");
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
