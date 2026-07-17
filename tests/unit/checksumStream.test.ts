import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexFromStream } from "../../src/server/media/checksum";

describe("sha256HexFromStream", () => {
  it("matches sha256Hex for the same bytes", async () => {
    const bytes = new TextEncoder().encode("large-object-chunk-test");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });

    const [bufferHash, streamHash] = await Promise.all([
      sha256Hex(new Uint8Array(bytes).buffer),
      sha256HexFromStream(stream),
    ]);

    expect(streamHash).toBe(bufferHash);
  });
});
