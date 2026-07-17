import { describe, expect, it } from "vitest";
import { isInlinePlayable } from "../../src/shared/mediaPlayback";

describe("isInlinePlayable", () => {
  it("allows photos regardless of mime", () => {
    expect(isInlinePlayable("photo", "image/jpeg")).toBe(true);
    expect(isInlinePlayable("photo", null)).toBe(true);
  });

  it("allows inline video formats", () => {
    expect(isInlinePlayable("video", "video/mp4")).toBe(true);
    expect(isInlinePlayable("video", "video/webm")).toBe(true);
    expect(isInlinePlayable("video", "video/quicktime")).toBe(true);
  });

  it("rejects non-inline video formats", () => {
    expect(isInlinePlayable("video", "application/octet-stream")).toBe(false);
    expect(isInlinePlayable("video", null)).toBe(false);
  });

  it("allows inline audio formats", () => {
    expect(isInlinePlayable("audio", "audio/mpeg")).toBe(true);
    expect(isInlinePlayable("audio", "audio/mp4")).toBe(true);
    expect(isInlinePlayable("audio", "audio/wav")).toBe(true);
  });

  it("rejects audio/ogg (accepted upload, not inline)", () => {
    expect(isInlinePlayable("audio", "audio/ogg")).toBe(false);
  });

  it("rejects mp4v MPEG-4 Part 2 video", () => {
    expect(isInlinePlayable("video", "video/mp4", "mp4v")).toBe(false);
    expect(isInlinePlayable("video", "video/quicktime", "mp4v")).toBe(false);
  });

  it("allows H.264 video when mime matches", () => {
    expect(isInlinePlayable("video", "video/mp4", "avc1")).toBe(true);
  });
});
