import { describe, expect, it } from "vitest";
import { toMediaItemDTO } from "../../src/server/media/dto";
import type { media } from "../../src/server/db/schema";

type MediaRow = typeof media.$inferSelect;

function baseRow(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: 1,
    eventId: 1,
    title: "Test video",
    mediaType: "video",
    r2Key: "media/1/test.mp4",
    originalFilename: "test.mp4",
    mimeType: "video/mp4",
    size: 1000,
    checksum: "abc",
    status: "published",
    capturedDate: null,
    datePrecision: "unknown",
    description: null,
    provenance: null,
    externalUrl: null,
    displayKey: null,
    thumbKey: null,
    videoCodec: "avc1",
    processingProvider: "stream",
    streamUid: "stream-uid-1",
    streamState: "ready",
    processingStartedOn: null,
    processedOn: null,
    processingAttempts: 1,
    processingErrorCode: null,
    processingErrorMessage: null,
    streamLastCheckedOn: null,
    createdBy: 1,
    isDeleted: false,
    createdOn: "2024-01-01",
    modifiedOn: "2024-01-01",
    ...overrides,
  };
}

describe("toMediaItemDTO", () => {
  it("maps published Stream videos to playback and thumbnail endpoints", () => {
    const dto = toMediaItemDTO(baseRow());
    expect(dto.url).toBe("/media/1?variant=original");
    expect(dto.thumbUrl).toBe("/api/media/1/thumbnail");
    expect(dto.playbackUrl).toBe("/api/media/1/playback");
    expect(dto.playable).toBe(true);
    expect(dto.processingError).toBeNull();
  });

  it("maps processing Stream videos as not playable", () => {
    const dto = toMediaItemDTO(
      baseRow({ status: "processing", streamUid: null }),
    );
    expect(dto.playable).toBe(false);
    expect(dto.playbackUrl).toBeNull();
    expect(dto.thumbUrl).toBeNull();
  });

  it("maps failed videos with sanitized processing errors", () => {
    const dto = toMediaItemDTO(
      baseRow({
        status: "failed",
        processingErrorCode: "STREAM_PROCESSING_FAILED",
        processingErrorMessage: "Failed",
      }),
    );
    expect(dto.processingError?.code).toBe("STREAM_PROCESSING_FAILED");
    expect(dto.playable).toBe(false);
  });

  it("keeps legacy published videos on direct delivery URLs", () => {
    const dto = toMediaItemDTO(
      baseRow({
        processingProvider: null,
        streamUid: null,
      }),
    );
    expect(dto.url).toBe("/media/1");
    expect(dto.playbackUrl).toBeNull();
    expect(dto.playable).toBe(true);
  });
});
