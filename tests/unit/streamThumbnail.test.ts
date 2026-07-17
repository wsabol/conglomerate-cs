import { describe, expect, it } from "vitest";
import { streamThumbnailUrl } from "../../src/server/media/playback";

describe("streamThumbnailUrl", () => {
  it("puts the signed token in the path for requireSignedURLs videos", () => {
    const url = streamThumbnailUrl("abc123", "signed.jwt.token");
    expect(url).toBe(
      "https://customer-abc123.cloudflarestream.com/signed.jwt.token/thumbnails/thumbnail.jpg",
    );
    expect(url).not.toContain("?token=");
  });
});
