import type { Env } from "../env";
import { getConfig } from "../lib/config";
import { createPresignedGetUrl } from "./presign";

export interface StreamVideoStatus {
  uid: string;
  readyToStream: boolean;
  state: string | null;
  durationSeconds: number | null;
}

export interface StreamVideoService {
  ingestFromR2(input: {
    mediaId: number;
    r2Key: string;
    filename: string;
    creatorId: number;
  }): Promise<{ uid: string; state: string | null }>;

  getVideo(uid: string): Promise<StreamVideoStatus>;

  createPlaybackToken(uid: string): Promise<string>;

  deleteVideo(uid: string): Promise<void>;
}

function mapVideoStatus(video: StreamVideo): StreamVideoStatus {
  const duration =
    typeof video.duration === "number" && video.duration > 0
      ? video.duration
      : null;
  return {
    uid: video.id,
    readyToStream: video.readyToStream,
    state: video.status?.state ?? null,
    durationSeconds: duration,
  };
}

export function createStreamVideoService(env: Env): StreamVideoService {
  const config = getConfig(env);
  const origin = new URL(config.appAllowedOrigin).origin;

  return {
    async ingestFromR2({ mediaId, r2Key, filename, creatorId }) {
      const presignedUrl = await createPresignedGetUrl(
        env,
        r2Key,
        config.streamIngestPresignTtlSeconds,
      );

      const video = await env.STREAM.upload(presignedUrl, {
        requireSignedURLs: true,
        allowedOrigins: [origin],
        creator: String(creatorId),
        meta: {
          mediaId: String(mediaId),
          r2Key,
          originalFilename: filename,
        },
        thumbnailTimestampPct: 0.1,
      });

      return {
        uid: video.id,
        state: video.status?.state ?? null,
      };
    },

    async getVideo(uid) {
      const video = await env.STREAM.video(uid).details();
      return mapVideoStatus(video);
    },

    async createPlaybackToken(uid) {
      return env.STREAM.video(uid).generateToken();
    },

    async deleteVideo(uid) {
      await env.STREAM.video(uid).delete();
    },
  };
}
