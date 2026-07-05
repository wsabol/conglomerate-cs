import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/server/app";
import type { ApiResponse } from "../../src/shared/types";

describe("GET /api/health", () => {
  it("returns the standard healthy envelope", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<{
      ok: boolean;
      environment: string;
    }>;
    expect(body.message).toBe("healthy");
    expect(body.data?.ok).toBe(true);
  });

  it("unknown API routes return the error envelope", async () => {
    const res = await app.request("/api/does-not-exist", {}, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.message).toBe("Not found.");
    expect(body.data).toEqual({});
  });
});
