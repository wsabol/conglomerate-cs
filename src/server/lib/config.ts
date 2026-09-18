import type { Env } from "../env";
import type { MediaType } from "@shared/types";
import { INLINE_PLAYBACK_MIMES } from "@shared/mediaPlayback";
import {
  DEFAULT_UPLOAD_LIMIT_BYTES,
  UPLOAD_MIME_CATEGORIES,
} from "@shared/uploadLimits";

// Central, env-overridable configuration. Nothing here should be hard-coded
// inline elsewhere in the application (PRD Sec: Upload limits / Media).

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Split a comma-separated env var, ignoring empty segments. */
export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseAppAllowedOrigins(env: Env): string[] {
  const origins = parseCsv(env.APP_ALLOWED_ORIGIN);
  if (origins.length > 0) return origins;
  return parseCsv(env.APP_BASE_URL ?? "http://localhost:5173");
}

export interface UploadLimits {
  photo: number;
  audio: number;
  video: number;
  document: number;
}

export interface AppConfig {
  narrativesEnabled?: boolean;
  narrativeModel?: string;
  narrativeInputMaxBytes?: number;
  narrativeEvidenceMaxBytes?: number;
  narrativeOutputMaxChars?: number;
  narrativeOutputTokens?: number;
  /** Calendar years the band was publicly active (home page stats). */
  archiveYearsActive: { start: number; end: number };
  accessEnforced: boolean;
  accessTeamDomain: string;
  /** Accepted Access application AUDs (preview and production may differ). */
  accessAuds: string[];
  /** Application audience by public hostname for the Access login start URL. */
  accessLoginAudiences: Record<string, string>;
  accessAccountId: string;
  accessPolicyId: string;
  devUserEmail: string | null;
  devUserRole: string | null;
  appBaseUrl: string;
  inviteFromEmail: string;
  inviteThrottleHours: number;
  feedbackToEmail: string;
  feedbackFromEmail: string;
  githubIssuesRepo: string;
  feedbackMessageMaxChars: number;
  feedbackDetailMaxChars: number;
  feedbackPagePathMaxChars: number;
  uploadLimits: UploadLimits;
  presignTtlSeconds: number;
  /** Canonical origin used when a single value is required. */
  appAllowedOrigin: string;
  /** All browser origins that may play Stream video or upload to R2. */
  appAllowedOrigins: string[];
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
  const appAllowedOrigins = parseAppAllowedOrigins(env);
  return {
    narrativesEnabled: env.NARRATIVES_ENABLED === "true",
    narrativeModel: env.NARRATIVE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    // Bound inputs; condense evidence separately so the editing target stays intact.
    narrativeInputMaxBytes: 32_000,
    narrativeEvidenceMaxBytes: 16_000,
    narrativeOutputMaxChars: 20_000,
    narrativeOutputTokens: 8_000,
    archiveYearsActive: { start: 2009, end: 2016 },
    accessEnforced: (env.ACCESS_ENFORCED ?? "false").toLowerCase() === "true",
    accessTeamDomain: env.ACCESS_TEAM_DOMAIN ?? "",
    accessAuds: parseCsv(env.ACCESS_AUD),
    accessLoginAudiences: Object.fromEntries(
      parseCsv(env.ACCESS_LOGIN_AUDIENCES).flatMap((entry) => {
        const separator = entry.indexOf("=");
        if (separator <= 0 || separator === entry.length - 1) return [];
        return [[entry.slice(0, separator).toLowerCase(), entry.slice(separator + 1)]];
      }),
    ),
    accessAccountId: env.ACCESS_ACCOUNT_ID ?? "",
    accessPolicyId: env.ACCESS_POLICY_ID ?? "",
    devUserEmail: env.DEV_USER_EMAIL || null,
    devUserRole: env.DEV_USER_ROLE || null,
    appBaseUrl: env.APP_BASE_URL ?? "http://localhost:5173",
    appAllowedOrigin: appAllowedOrigins[0] ?? "http://localhost:5173",
    appAllowedOrigins,
    inviteFromEmail: env.INVITE_FROM_EMAIL ?? "invites@theconglomerate.local",
    inviteThrottleHours: num(env.INVITE_THROTTLE_HOURS, 24),
    feedbackToEmail: env.FEEDBACK_TO_EMAIL ?? "support@funkafterdeath.institute",
    feedbackFromEmail: env.FEEDBACK_FROM_EMAIL ?? env.INVITE_FROM_EMAIL ?? "invites@funkafterdeath.institute",
    githubIssuesRepo: env.GITHUB_ISSUES_REPO ?? "wsabol/conglomerate-cs",
    feedbackMessageMaxChars: 5000,
    feedbackDetailMaxChars: 2000,
    feedbackPagePathMaxChars: 500,
    uploadLimits: {
      photo: num(env.UPLOAD_MAX_PHOTO_BYTES, DEFAULT_UPLOAD_LIMIT_BYTES.photo),
      audio: num(env.UPLOAD_MAX_AUDIO_BYTES, DEFAULT_UPLOAD_LIMIT_BYTES.audio),
      video: num(env.UPLOAD_MAX_VIDEO_BYTES, DEFAULT_UPLOAD_LIMIT_BYTES.video),
      document: num(
        env.UPLOAD_MAX_DOCUMENT_BYTES,
        DEFAULT_UPLOAD_LIMIT_BYTES.document,
      ),
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
      photo: [...UPLOAD_MIME_CATEGORIES.photo],
      video: [...UPLOAD_MIME_CATEGORIES.video],
      audio: [...UPLOAD_MIME_CATEGORIES.audio],
      document: [...UPLOAD_MIME_CATEGORIES.document],
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

export const CONFIDENCE_BACKFILL_MAX_BATCH = 25;
export const HOME_ACTIVITY_LIMIT = 8;
