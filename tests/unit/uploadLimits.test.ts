import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPLOAD_LIMIT_BYTES,
  formatFileSize,
  uploadSizeExceededMessage,
  validateUploadFileSize,
} from "../../src/shared/uploadLimits";

describe("uploadLimits", () => {
  it("formats megabytes without decimals for whole values", () => {
    expect(formatFileSize(200 * 1024 * 1024)).toBe("200 MB");
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("rejects oversized videos with a clear message", () => {
    const message = validateUploadFileSize({
      name: "gigantic.mov",
      type: "video/quicktime",
      size: DEFAULT_UPLOAD_LIMIT_BYTES.video + 1,
    });
    expect(message).toBe(
      uploadSizeExceededMessage(
        "video",
        DEFAULT_UPLOAD_LIMIT_BYTES.video,
        DEFAULT_UPLOAD_LIMIT_BYTES.video + 1,
        "gigantic.mov",
      ),
    );
    expect(message).toContain("200 MB");
    expect(message).toContain("gigantic.mov");
  });

  it("allows videos within the limit", () => {
    expect(
      validateUploadFileSize({
        name: "clip.mp4",
        type: "video/mp4",
        size: DEFAULT_UPLOAD_LIMIT_BYTES.video,
      }),
    ).toBeNull();
  });

  it("rejects unsupported file types", () => {
    expect(
      validateUploadFileSize({
        name: "notes.txt",
        type: "text/plain",
        size: 100,
      }),
    ).toContain("notes.txt");
  });
});
