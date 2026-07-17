import type { Env } from "../env";
import { getConfig } from "../lib/config";
import { createStreamIngestSourceUrl } from "./ingestUrl";

/** Cloudflare Stream basic direct upload limit (see direct creator uploads docs). */
const STREAM_DIRECT_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

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
    /** When already in memory (e.g. upload complete checksum pass). */
    videoBuffer?: ArrayBuffer;
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

/** Stream expects hostnames only — no `https://` scheme or path. */
export function normalizeStreamAllowedOrigin(allowedOrigin: string): string {
  return new URL(allowedOrigin).host;
}

function streamUploadParams(
  config: ReturnType<typeof getConfig>,
  allowedOrigin: string,
  input: { mediaId: number; r2Key: string; filename: string; creatorId: number },
) {
  return {
    maxDurationSeconds: config.streamMaxDurationSeconds,
    requireSignedURLs: true as const,
    allowedOrigins: [allowedOrigin],
    creator: String(input.creatorId),
    meta: {
      mediaId: String(input.mediaId),
      r2Key: input.r2Key,
      originalFilename: input.filename,
    },
    thumbnailTimestampPct: 0.1,
  };
}

async function ingestViaDirectUpload(
  env: Env,
  object: R2ObjectBody,
  filename: string,
  uploadParams: ReturnType<typeof streamUploadParams>,
  videoBuffer?: ArrayBuffer,
): Promise<{ uid: string; state: string | null }> {
  const directUpload = await env.STREAM.createDirectUpload(uploadParams);

  const mime = object.httpMetadata?.contentType ?? "video/mp4";
  const bytes = videoBuffer ?? (await object.arrayBuffer());
  const formData = new FormData();
  formData.append("file", new File([bytes], filename, { type: mime }));

  const uploadResponse = await fetch(directUpload.uploadURL, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Stream direct upload failed (${uploadResponse.status}): ${detail.slice(0, 300)}`,
    );
  }

  const video = await env.STREAM.video(directUpload.id).details();
  return {
    uid: directUpload.id,
    state: video.status?.state ?? null,
  };
}

async function ingestViaCopyUrl(
  env: Env,
  config: ReturnType<typeof getConfig>,
  allowedOrigin: string,
  input: { mediaId: number; r2Key: string; filename: string; creatorId: number },
): Promise<{ uid: string; state: string | null }> {
  const ingestUrl = await createStreamIngestSourceUrl(
    env,
    input.mediaId,
    input.r2Key,
    config.streamIngestPresignTtlSeconds,
  );

  const video = await env.STREAM.upload(ingestUrl, {
    requireSignedURLs: true,
    allowedOrigins: [allowedOrigin],
    creator: String(input.creatorId),
    meta: {
      mediaId: String(input.mediaId),
      r2Key: input.r2Key,
      originalFilename: input.filename,
    },
    thumbnailTimestampPct: 0.1,
  });

  return {
    uid: video.id,
    state: video.status?.state ?? null,
  };
}

export function createStreamVideoService(env: Env): StreamVideoService {
  const config = getConfig(env);
  const allowedOrigin = normalizeStreamAllowedOrigin(config.appAllowedOrigin);

  return {
    async ingestFromR2(input) {
      const object = await env.MEDIA.get(input.r2Key);
      if (!object) {
        throw new Error("Original file not found in storage.");
      }

      const uploadParams = streamUploadParams(config, allowedOrigin, input);
      const filename = input.filename || `media-${input.mediaId}.mp4`;

      if (object.size < STREAM_DIRECT_UPLOAD_MAX_BYTES) {
        return ingestViaDirectUpload(
          env,
          object,
          filename,
          uploadParams,
          input.videoBuffer,
        );
      }

      return ingestViaCopyUrl(env, config, allowedOrigin, input);
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
