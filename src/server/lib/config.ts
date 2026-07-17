import type { Env } from "../env";
import type { MediaType } from "@shared/types";
import { INLINE_PLAYBACK_MIMES } from "@shared/mediaPlayback";

// Central, env-overridable configuration. Nothing here should be hard-coded
// inline elsewhere in the application (PRD Sec: Upload limits / Media).

const MB = 1024 * 1024;
const GB = 1024 * MB;

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface UploadLimits {
  photo: number;
  audio: number;
  video: number;
  document: number;
}

export interface AppConfig {
  /** Calendar years the band was publicly active (home page stats). */
  archiveYearsActive: { start: number; end: number };
  accessEnforced: boolean;
  accessTeamDomain: string;
  accessAud: string;
  accessAccountId: string;
  accessPolicyId: string;
  devUserEmail: string | null;
  devUserRole: string | null;
  appBaseUrl: string;
  inviteFromEmail: string;
  inviteTokenTtlDays: number;
  inviteThrottleHours: number;
  uploadLimits: UploadLimits;
  presignTtlSeconds: number;
  appAllowedOrigin: string;
  streamIngestPresignTtlSeconds: number;
  streamPlaybackTokenTtlSeconds: number;
  streamProcessingMaxAttempts: number;
  streamProcessingTimeoutHours: number;
  streamMaxDurationSeconds: number;
  /** MIME types accepted per media category. */
  allowedMimeTypes: Record<Exclude<MediaType, "link">, string[]>;
  /** MIME types that support inline browser playback. */
  inlinePlayback: { audio: string[]; video: string[] };
}

export function getConfig(env: Env): AppConfig {
  return {
    archiveYearsActive: { start: 2009, end: 2016 },
    accessEnforced: (env.ACCESS_ENFORCED ?? "false").toLowerCase() === "true",
    accessTeamDomain: env.ACCESS_TEAM_DOMAIN ?? "",
    accessAud: env.ACCESS_AUD ?? "",
    accessAccountId: env.ACCESS_ACCOUNT_ID ?? "",
    accessPolicyId: env.ACCESS_POLICY_ID ?? "",
    devUserEmail: env.DEV_USER_EMAIL || null,
    devUserRole: env.DEV_USER_ROLE || null,
    appBaseUrl: env.APP_BASE_URL ?? "http://localhost:5173",
    appAllowedOrigin:
      env.APP_ALLOWED_ORIGIN ?? env.APP_BASE_URL ?? "http://localhost:5173",
    inviteFromEmail: env.INVITE_FROM_EMAIL ?? "invites@theconglomerate.local",
    inviteTokenTtlDays: num(env.INVITE_TOKEN_TTL_DAYS, 7),
    inviteThrottleHours: num(env.INVITE_THROTTLE_HOURS, 24),
    uploadLimits: {
      photo: num(env.UPLOAD_MAX_PHOTO_BYTES, 25 * MB),
      audio: num(env.UPLOAD_MAX_AUDIO_BYTES, 500 * MB),
      video: num(env.UPLOAD_MAX_VIDEO_BYTES, 2 * GB),
      document: num(env.UPLOAD_MAX_DOCUMENT_BYTES, 100 * MB),
    },
    presignTtlSeconds: num(env.PRESIGN_TTL_SECONDS, 15 * 60),
    streamIngestPresignTtlSeconds: num(
      env.STREAM_INGEST_PRESIGN_TTL_SECONDS,
      60 * 60,
    ),
    streamPlaybackTokenTtlSeconds: num(
      env.STREAM_PLAYBACK_TOKEN_TTL_SECONDS,
      30 * 60,
    ),
    streamProcessingMaxAttempts: num(env.STREAM_PROCESSING_MAX_ATTEMPTS, 3),
    streamProcessingTimeoutHours: num(env.STREAM_PROCESSING_TIMEOUT_HOURS, 24),
    streamMaxDurationSeconds: num(env.STREAM_MAX_DURATION_SECONDS, 4 * 60 * 60),
    allowedMimeTypes: {
      photo: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/gif",
      ],
      video: ["video/mp4", "video/webm", "video/quicktime"],
      audio: [
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/x-m4a",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
      ],
      document: ["application/pdf"],
    },
    inlinePlayback: {
      audio: [...INLINE_PLAYBACK_MIMES.audio],
      video: [...INLINE_PLAYBACK_MIMES.video],
    },
  };
}

/** Map a MIME type to the media category it belongs to (or null). */
export function mediaTypeForMime(
  env: Env,
  mime: string,
): Exclude<MediaType, "link"> | null {
  const { allowedMimeTypes } = getConfig(env);
  for (const [type, list] of Object.entries(allowedMimeTypes)) {
    if (list.includes(mime)) return type as Exclude<MediaType, "link">;
  }
  return null;
}
