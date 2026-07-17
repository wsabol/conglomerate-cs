import { describe, expect, it } from "vitest";
import {
  classifyStreamIngestError,
  sanitizeIngestErrorText,
} from "../../src/server/media/ingestErrors";

describe("ingestErrors", () => {
  it("classifies missing webhook secret errors", () => {
    const result = classifyStreamIngestError(
      new Error("STREAM_WEBHOOK_SECRET is required for Worker-mediated Stream ingestion."),
      { method: "copy_by_url" },
    );
    expect(result.code).toBe("STREAM_INGEST_FAILED");
    expect(result.message).toContain("STREAM_WEBHOOK_SECRET");
  });

  it("classifies direct upload HTTP failures", () => {
    const result = classifyStreamIngestError(
      new Error("Stream direct upload failed (403): quota exceeded"),
      { method: "direct_upload", sizeBytes: 78_000_000 },
    );
    expect(result.message).toContain("403");
  });

  it("sanitizes URLs from stored errors", () => {
    expect(
      sanitizeIngestErrorText(
        "failed https://example.com/secret?token=abc123 path",
      ),
    ).toBe("failed [url] path");
  });
});
