// Shared contracts used by both the client and the Worker API.

/** Standard response envelope for every API endpoint (PRD Sec: API Surface). */
export type ApiResponse<T> = {
  data: T | null;
  message: string;
};

/** List endpoints wrap their arrays under `results`. */
export type ListResult<T> = { results: T[] };

/** Shape of the `details` array returned for SQL/validation errors. */
export type ApiErrorDetail = { message: string; error_code?: string | number };

export const USER_ROLES = ["member", "editor"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EVENT_TYPES = [
  "performance",
  "party",
  "rehearsal",
  "recording",
  "reunion",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const DATE_PRECISIONS = [
  "exact",
  "month",
  "semester",
  "year",
  "approximate",
  "unknown",
] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const PLACE_STATUSES = [
  "active",
  "closed",
  "demolished",
  "unknown",
] as const;
export type PlaceStatus = (typeof PLACE_STATUSES)[number];

export const RELATIONSHIP_TYPES = [
  "performer",
  "attendee",
  "organizer",
  "photographer",
  "unknown",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const BILLING_ROLES = ["opener", "headliner", "unknown"] as const;
export type BillingRole = (typeof BILLING_ROLES)[number];

/** Core band names that count as a headlined show when billed as headliner. */
export const HEADLINER_ACT_NAMES = [
  "The Conglomerate",
  "The Syndicate",
  "The Brain Police",
] as const;

export const SOURCE_TYPES = ["media", "url", "text"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const MEDIA_TYPES = [
  "photo",
  "video",
  "audio",
  "document",
  "link",
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_STATUSES = [
  "uploading",
  "processing",
  "published",
  "failed",
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const ANNOTATION_TARGET_TYPES = ["event", "media"] as const;
export type AnnotationTargetType = (typeof ANNOTATION_TARGET_TYPES)[number];

export const ANNOTATION_TYPES = [
  "personal_memory",
  "secondhand_account",
  "correction",
  "quote",
  // "context",
] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const INCORPORATE_PREFS = ["yes", "no_pref", "separate"] as const;
export type IncorporatePref = (typeof INCORPORATE_PREFS)[number];

export const REVISION_TARGET_TYPES = [
  "annotation",
  "event",
  "people",
  "places",
  "media",
] as const;
export type RevisionTargetType = (typeof REVISION_TARGET_TYPES)[number];

export const REVISION_ACTIONS = ["create", "update", "delete"] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];

export const INVITE_STATUSES = ["pending", "sent", "failed"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];
