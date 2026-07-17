import { describe, expect, it } from "vitest";
import type { Env } from "../../src/server/env";
import {
  createWorkerIngestUrl,
  verifyWorkerIngestToken,
} from "../../src/server/media/ingestUrl";

const secret = "test-webhook-secret";

describe("ingestUrl", () => {
  it("creates and verifies a worker ingest URL token", async () => {
    const env = {
      STREAM_WEBHOOK_SECRET: secret,
      APP_BASE_URL: "https://archive.example",
      ACCESS_ENFORCED: "false",
    } as Env;

    const url = await createWorkerIngestUrl(env, 63, "media/63/original.mp4", 3600);
    expect(url).toMatch(
      /^https:\/\/archive\.example\/api\/stream-ingest\/63\?exp=\d+&token=[a-f0-9]+$/,
    );

    const parsed = new URL(url);
    const exp = Number(parsed.searchParams.get("exp"));
    const token = parsed.searchParams.get("token") ?? "";

    expect(
      await verifyWorkerIngestToken(secret, 63, "media/63/original.mp4", exp, token),
    ).toBe(true);
    expect(
      await verifyWorkerIngestToken(secret, 63, "media/wrong.mp4", exp, token),
    ).toBe(false);
    expect(
      await verifyWorkerIngestToken(secret, 63, "media/63/original.mp4", exp - 7200, token),
    ).toBe(false);
  });
});
