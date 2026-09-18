import { describe, expect, it } from "vitest";
import {
  normalizeStreamAllowedOrigin,
  streamAllowedOrigins,
} from "../../src/server/media/stream";

describe("normalizeStreamAllowedOrigin", () => {
  it("strips the scheme from allowed origins", () => {
    expect(
      normalizeStreamAllowedOrigin(
        "https://conglomerate-cs.wsabol39.workers.dev",
      ),
    ).toBe("conglomerate-cs.wsabol39.workers.dev");
  });

  it("preserves non-default ports", () => {
    expect(normalizeStreamAllowedOrigin("http://localhost:5173")).toBe(
      "localhost:5173",
    );
  });
});

describe("streamAllowedOrigins", () => {
  it("keeps production and preview hosts for signed playback", () => {
    expect(
      streamAllowedOrigins([
        "https://www.funkafterdeath.institute",
        "https://funkafterdeath.institute",
        "https://conglomerate-cs.wsabol39.workers.dev",
      ]),
    ).toEqual([
      "www.funkafterdeath.institute",
      "funkafterdeath.institute",
      "conglomerate-cs.wsabol39.workers.dev",
    ]);
  });
});

