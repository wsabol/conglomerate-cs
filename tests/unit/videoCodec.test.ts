import { describe, expect, it } from "vitest";
import { sniffVideoCodec } from "../../src/server/media/codec";

describe("sniffVideoCodec", () => {
  it("detects mp4v in a moov atom tail", () => {
    const padding = new Uint8Array(100).fill(0x20);
    const moov = new TextEncoder().encode("moovtraktkhdvideHandlermp4v");
    const buffer = new Uint8Array([...padding, ...moov]).buffer;
    expect(sniffVideoCodec(buffer)).toBe("mp4v");
  });

  it("prefers avc1 over mp4v when both are present", () => {
    const text = "moovtrakvideHandleravc1extra mp4v";
    const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
    expect(sniffVideoCodec(buffer)).toBe("avc1");
  });
});
