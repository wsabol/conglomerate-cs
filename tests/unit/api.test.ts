import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiClientError } from "../../src/client/lib/api";

function jsonResponse(
  body: unknown,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries GET requests once on 503", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse({ data: null, message: "Unavailable." }, 503);
      }
      return jsonResponse({ data: { ok: true }, message: "ok" }, 200);
    });

    const data = await apiFetch<{ ok: boolean }>("/api/health");
    expect(calls).toBe(2);
    expect(data.ok).toBe(true);
  });

  it("does not retry POST requests", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return jsonResponse({ data: null, message: "Unavailable." }, 503);
    });

    await expect(
      apiFetch("/api/events", { method: "POST", body: "{}" }),
    ).rejects.toBeInstanceOf(ApiClientError);
    expect(calls).toBe(1);
  });

  it("does not retry 400 responses", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return jsonResponse({ data: null, message: "Validation failed." }, 400);
    });

    await expect(apiFetch("/api/events")).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });
});
