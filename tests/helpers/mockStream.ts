import type { StreamBinding } from "@cloudflare/workers-types";

const READY_STATUS = {
  state: "ready",
  errorReasonCode: "",
  errorReasonText: "",
};

const PROGRESS_STATUS = {
  state: "inprogress",
  errorReasonCode: "",
  errorReasonText: "",
};

export function createMockStreamBinding(): StreamBinding {
  const videos = new Map<string, Record<string, unknown>>();

  function makeVideo(id: string) {
    return {
      id,
      creator: null,
      thumbnail: `https://example.test/${id}/thumb.jpg`,
      thumbnailTimestampPct: 0.1,
      readyToStream: false,
      readyToStreamAt: null,
      status: PROGRESS_STATUS,
      meta: {},
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      scheduledDeletion: null,
      size: 1000,
      allowedOrigins: [],
      requireSignedURLs: true,
      uploaded: new Date().toISOString(),
      uploadExpiry: null,
      maxSizeBytes: null,
      maxDurationSeconds: null,
      duration: 60,
      input: { width: 1920, height: 1080 },
      playback: {},
      watermark: null,
      clippedFrom: null,
      publicDetails: null,
    };
  }

  const binding = {
    video(id: string) {
      return {
        id,
        async details() {
          return (videos.get(id) ?? makeVideo(id)) as never;
        },
        async update(params: Record<string, unknown>) {
          const current = (videos.get(id) ?? makeVideo(id)) as Record<
            string,
            unknown
          >;
          const updated = { ...current, ...params };
          videos.set(id, updated);
          return updated as never;
        },
        async delete() {
          videos.delete(id);
        },
        async generateToken() {
          return `token-${id}`;
        },
        downloads: {},
        captions: {},
      };
    },
    async upload(_url: string, params?: Record<string, unknown>) {
      const id = `stream-${crypto.randomUUID()}`;
      const video = {
        ...makeVideo(id),
        creator: params?.creator ?? null,
        meta: params?.meta ?? {},
      };
      videos.set(id, video);
      return video as never;
    },
    async createDirectUpload(params?: Record<string, unknown>) {
      const id = `stream-${crypto.randomUUID()}`;
      const video = {
        ...makeVideo(id),
        creator: params?.creator ?? null,
        meta: params?.meta ?? {},
      };
      videos.set(id, video);
      return {
        uploadURL: `https://stream-mock.test/direct/${id}`,
        id,
        watermark: null,
        scheduledDeletion: null,
      } as never;
    },
    videos: {},
    watermarks: {},
  };

  return binding as unknown as StreamBinding;
}

export async function markMockStreamReady(
  binding: StreamBinding,
  uid: string,
): Promise<void> {
  await binding.video(uid).update({
    readyToStream: true,
    status: READY_STATUS,
  } as never);
}
