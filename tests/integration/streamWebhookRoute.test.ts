import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../../src/server/app";

describe("stream webhook route", () => {
  it("returns 405 for GET", async () => {
    const response = await app.request(
      "/api/webhooks/cloudflare-stream",
      { method: "GET" },
      env,
    );
    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });

  it("returns 401 for POST without a valid signature", async () => {
    const response = await app.request(
      "/api/webhooks/cloudflare-stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "test" }),
      },
      env,
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Invalid webhook signature.");
  });
});
