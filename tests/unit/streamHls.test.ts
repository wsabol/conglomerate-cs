import { describe, expect, it } from "vitest";
import { streamHlsUrl } from "../../src/server/media/playback";

describe("streamHlsUrl", () => {
  it("builds a signed HLS manifest URL from customer code and token", () => {
    const url = streamHlsUrl("abc123", "signed.jwt.token");
    expect(url).toBe(
      "https://customer-abc123.cloudflarestream.com/signed.jwt.token/manifest/video.m3u8",
    );
  });
});
