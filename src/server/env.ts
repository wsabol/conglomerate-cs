import type { UserRole } from "@shared/types";

/** Bindings & vars available on the Worker (see wrangler.toml). */
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  STREAM: StreamBinding;
  ASSETS: Fetcher;

  ENVIRONMENT: string;

  // Authentication perimeter (Cloudflare Access).
  ACCESS_ENFORCED?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ACCOUNT_ID?: string;
  ACCESS_POLICY_ID?: string;
  // Local-only identity override; never set in production.
  DEV_USER_EMAIL?: string;
  DEV_USER_ROLE?: string;

  // Invite tooling.
  APP_BASE_URL?: string;
  APP_ALLOWED_ORIGIN?: string;
  INVITE_FROM_EMAIL?: string;
  INVITE_TOKEN_TTL_DAYS?: string;
  INVITE_THROTTLE_HOURS?: string;
  RESEND_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // R2 S3-compatible credentials for presigned uploads (Milestone 6).
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_ENDPOINT?: string;

  // Upload-limit / config overrides (Milestone 6, PRD Sec: Upload limits).
  UPLOAD_MAX_PHOTO_BYTES?: string;
  UPLOAD_MAX_AUDIO_BYTES?: string;
  UPLOAD_MAX_VIDEO_BYTES?: string;
  UPLOAD_MAX_DOCUMENT_BYTES?: string;
  PRESIGN_TTL_SECONDS?: string;

  // Cloudflare Stream (video processing and playback).
  STREAM_WEBHOOK_SECRET?: string;
  STREAM_CUSTOMER_CODE?: string;
  STREAM_INGEST_PRESIGN_TTL_SECONDS?: string;
  STREAM_PLAYBACK_TOKEN_TTL_SECONDS?: string;
  STREAM_PROCESSING_MAX_ATTEMPTS?: string;
  STREAM_PROCESSING_TIMEOUT_HOURS?: string;
}

/** The resolved application user attached to each request. */
export interface AppUser {
  id: number;
  email: string;
  role: UserRole;
  personId: number | null;
}

export interface Variables {
  /** Populated by the identity middleware; null when unauthenticated. */
  user: AppUser | null;
  requestId: string;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
