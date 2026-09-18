import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import { getDb } from "../../src/server/db/client";
import { feedback, users } from "../../src/server/db/schema";
import type { Env } from "../../src/server/env";
import type { ApiResponse, ListResult } from "../../src/shared/types";
import type { FeedbackDTO } from "../../src/shared/dto";

const input = {
  category: "bug",
  message: "The timeline jumps",
  whatHappened: "It scrolls to the top",
  reproductionSteps: "Open the timeline and filter",
  pagePath: "/timeline",
};

function request(body: object, email?: string) {
  return {
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      ...(email ? { "Cf-Access-Authenticated-User-Email": email } : {}),
    },
    body: JSON.stringify(body),
  };
}

function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...env, RESEND_API_KEY: "test-resend-key", GITHUB_ISSUES_TOKEN: "test-github-key", ...overrides } as Env;
}

describe("feedback", () => {
  const outbound = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "https://api.resend.com/emails") {
      const email = JSON.parse(String(init?.body)) as { to: string[]; text: string };
      expect(email.to).toEqual(["admin@funkafterdeath.institute"]);
      expect(email.text).toContain("The timeline jumps");
      return new Response(JSON.stringify({ id: "mail-1" }), { status: 200 });
    }
    if (String(url) === "https://api.github.com/repos/wsabol/conglomerate-cs/issues") {
      const issue = JSON.parse(String(init?.body)) as { body: string };
      expect(issue.body).toContain("The timeline jumps");
      expect(issue.body).not.toContain("member@band.test");
      return new Response(JSON.stringify({ html_url: "https://github.com/wsabol/conglomerate-cs/issues/42" }), { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${String(url)}`);
  });

  beforeEach(async () => {
    outbound.mockClear();
    vi.stubGlobal("fetch", outbound);
    const db = getDb(env);
    await db.delete(feedback);
    await db.delete(users);
    await db.insert(users).values({ email: "member@band.test", role: "member" });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("accepts member feedback, saves it, and sends a notification", async () => {
    const response = await app.request("/api/feedback", request(input, "member@band.test"), testEnv());
    expect(response.status).toBe(201);
    const rows = await getDb(env).select().from(feedback);
    expect(rows).toHaveLength(1);
    expect(rows[0].notificationStatus).toBe("sent");
    expect(rows[0].pagePath).toBe("/timeline");
    expect(outbound).toHaveBeenCalledTimes(1);
  });

  it("validates submissions and limits editor access", async () => {
    const invalid = await app.request("/api/feedback", request({ ...input, message: "", pagePath: "https://other.test" }, "member@band.test"), testEnv());
    expect(invalid.status).toBe(400);
    const memberList = await app.request("/api/feedback", { headers: { "Cf-Access-Authenticated-User-Email": "member@band.test" } }, testEnv());
    expect(memberList.status).toBe(403);
    expect(await getDb(env).select().from(feedback)).toHaveLength(0);
  });

  it("keeps a report if email fails, then allows an editor to retry", async () => {
    const first = await app.request("/api/feedback", request(input, "member@band.test"), testEnv({ RESEND_API_KEY: undefined }));
    expect(first.status).toBe(201);
    const id = (await first.json() as ApiResponse<{ id: number }>).data!.id;
    let rows = await getDb(env).select().from(feedback);
    expect(rows[0].notificationStatus).toBe("failed");
    const retried = await app.request(`/api/feedback/${id}/retry-notification`, { method: "POST" }, testEnv());
    expect(retried.status).toBe(200);
    rows = await getDb(env).select().from(feedback);
    expect(rows[0].notificationStatus).toBe("sent");
    expect(outbound).toHaveBeenCalledTimes(1);
  });

  it("lets editors review reports and create exactly one GitHub issue", async () => {
    const first = await app.request("/api/feedback", request(input, "member@band.test"), testEnv());
    const id = (await first.json() as ApiResponse<{ id: number }>).data!.id;
    const listed = await app.request("/api/feedback?category=bug", {}, testEnv());
    const listBody = await listed.json() as ApiResponse<ListResult<FeedbackDTO>>;
    expect(listBody.data?.results[0].submitterEmail).toBe("member@band.test");
    const reviewed = await app.request(`/api/feedback/${id}/review`, { ...request({ reviewStatus: "reviewed" }), method: "PATCH" }, testEnv());
    expect(reviewed.status).toBe(200);
    const created = await app.request(`/api/feedback/${id}/github-issue`, { method: "POST" }, testEnv());
    expect(created.status).toBe(200);
    const duplicate = await app.request(`/api/feedback/${id}/github-issue`, { method: "POST" }, testEnv());
    expect(duplicate.status).toBe(409);
    expect((await getDb(env).select().from(feedback))[0].issueUrl).toContain("/issues/42");
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it("allows retry after a definite GitHub rejection", async () => {
    const first = await app.request("/api/feedback", request(input, "member@band.test"), testEnv());
    const id = (await first.json() as ApiResponse<{ id: number }>).data!.id;
    outbound.mockImplementationOnce(async () => new Response("denied", { status: 403 }));
    const failed = await app.request(`/api/feedback/${id}/github-issue`, { method: "POST" }, testEnv());
    expect(failed.status).toBe(502);
    expect((await getDb(env).select().from(feedback))[0].issueStatus).toBe("none");
  });

  it("holds an uncertain GitHub request to prevent a duplicate issue", async () => {
    const first = await app.request("/api/feedback", request(input, "member@band.test"), testEnv());
    const id = (await first.json() as ApiResponse<{ id: number }>).data!.id;
    outbound.mockImplementationOnce(async () => { throw new Error("network lost"); });
    const failed = await app.request(`/api/feedback/${id}/github-issue`, { method: "POST" }, testEnv());
    expect(failed.status).toBe(502);
    const again = await app.request(`/api/feedback/${id}/github-issue`, { method: "POST" }, testEnv());
    expect(again.status).toBe(409);
    expect((await getDb(env).select().from(feedback))[0].issueStatus).toBe("creating");
    const reset = await app.request(`/api/feedback/${id}/reset-github-issue`, { method: "POST" }, testEnv());
    expect(reset.status).toBe(200);
    expect((await getDb(env).select().from(feedback))[0].issueStatus).toBe("none");
  });
});
