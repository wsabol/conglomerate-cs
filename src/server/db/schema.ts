import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  ANNOTATION_TARGET_TYPES,
  ANNOTATION_TYPES,
  BILLING_ROLES,
  CONFIDENCE_LEVELS,
  DATE_PRECISIONS,
  EVENT_TYPES,
  INCORPORATE_PREFS,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  PLACE_STATUSES,
  RELATIONSHIP_TYPES,
  INVITE_STATUSES,
  REVISION_ACTIONS,
  REVISION_TARGET_TYPES,
  SOURCE_TYPES,
  USER_ROLES,
} from "@shared/types";

// Shared column helpers -------------------------------------------------------

const createdOn = () =>
  text("created_on")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);

const modifiedOn = () =>
  text("modified_on")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);

const isDeleted = () =>
  integer("is_deleted", { mode: "boolean" }).notNull().default(false);

// users ----------------------------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("member"),
    personId: integer("person_id"),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

// people ----------------------------------------------------------------------
// A Person is anyone we track through events; it never grants access.
export const people = sqliteTable(
  "people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    displayName: text("display_name").notNull(),
    aliases: text("aliases"), // comma-separated / free text
    bio: text("bio"),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [index("people_display_name_idx").on(t.displayName)],
);

// places ----------------------------------------------------------------------
export const places = sqliteTable(
  "places",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    placeType: text("place_type"), // restaurant, venue, residence, etc.
    address: text("address"), // exact address, or just city if unknown
    status: text("status", { enum: PLACE_STATUSES })
      .notNull()
      .default("unknown"),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [uniqueIndex("places_name_idx").on(t.name)],
);

// events ----------------------------------------------------------------------
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    eventType: text("event_type", { enum: EVENT_TYPES })
      .notNull()
      .default("performance"),
    eventDate: text("event_date"), // ISO yyyy-MM-dd (nullable when unknown)
    eventTime: text("event_time"), // 24h HH:mm start time (nullable)
    datePrecision: text("date_precision", { enum: DATE_PRECISIONS })
      .notNull()
      .default("exact"),
    placeId: integer("place_id").references(() => places.id),
    summary: text("summary"),
    confidence: text("confidence", { enum: CONFIDENCE_LEVELS })
      .notNull()
      .default("medium"),
    // References media.id; kept FK-free to avoid a circular table dependency.
    heroImageId: integer("hero_image_id"),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [
    uniqueIndex("events_slug_idx").on(t.slug),
    index("events_event_date_idx").on(t.eventDate),
    index("events_modified_on_idx").on(t.modifiedOn),
    index("events_event_type_idx").on(t.eventType),
  ],
);

// event_performance_details ---------------------------------------------------
export const eventPerformanceDetails = sqliteTable(
  "event_performance_details",
  {
    eventId: integer("event_id")
      .primaryKey()
      .references(() => events.id),
    billingName: text("billing_name"),
    promotionText: text("promotion_text"),
    setlistText: text("setlist_text"),
    eventPosterId: integer("event_poster_id"), // references media.id (FK-free)
  },
);

// event_sources ---------------------------------------------------------------
// Many sources per event (confirmed product decision), corroborating each event.
export const eventSources = sqliteTable(
  "event_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    sourceType: text("source_type", { enum: SOURCE_TYPES })
      .notNull()
      .default("text"),
    description: text("description"),
    url: text("url"),
    mediaId: integer("media_id"), // for screenshots (references media.id)
  },
  (t) => [index("event_sources_event_id_idx").on(t.eventId)],
);

// event_people ----------------------------------------------------------------
export const eventPeople = sqliteTable(
  "event_people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    relationshipType: text("relationship_type", { enum: RELATIONSHIP_TYPES })
      .notNull()
      .default("performer"),
    notes: text("notes"),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [
    uniqueIndex("event_people_unique_idx").on(
      t.eventId,
      t.personId,
      t.relationshipType,
    ),
    index("event_people_person_id_idx").on(t.personId),
  ],
);

// event_acts ------------------------------------------------------------------
export const eventActs = sqliteTable(
  "event_acts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    billingRole: text("billing_role", { enum: BILLING_ROLES })
      .notNull()
      .default("unknown"),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [
    uniqueIndex("event_acts_unique_idx").on(t.eventId, t.name),
    index("event_acts_event_id_idx").on(t.eventId),
  ],
);

// media -----------------------------------------------------------------------
export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id").references(() => events.id),
    title: text("title"),
    mediaType: text("media_type", { enum: MEDIA_TYPES }).notNull(),
    r2Key: text("r2_key"),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    size: integer("size"),
    checksum: text("checksum"),
    status: text("status", { enum: MEDIA_STATUSES })
      .notNull()
      .default("uploading"),
    capturedDate: text("captured_date"),
    datePrecision: text("date_precision", { enum: DATE_PRECISIONS })
      .notNull()
      .default("unknown"),
    description: text("description"),
    provenance: text("provenance"),
    externalUrl: text("external_url"), // for media_type = link
    displayKey: text("display_key"), // derived display variant (images)
    thumbKey: text("thumb_key"), // derived thumbnail (images)
    createdBy: integer("created_by").references(() => users.id),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [
    index("media_event_id_idx").on(t.eventId),
    index("media_media_type_idx").on(t.mediaType),
    index("media_status_idx").on(t.status),
    uniqueIndex("media_checksum_published_uidx")
      .on(t.checksum)
      .where(
        sql`${t.checksum} IS NOT NULL AND ${t.isDeleted} = 0 AND ${t.status} = 'published'`,
      ),
  ],
);

// media_people ----------------------------------------------------------------
export const mediaPeople = sqliteTable(
  "media_people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaId: integer("media_id")
      .notNull()
      .references(() => media.id),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
  },
  (t) => [uniqueIndex("media_people_unique_idx").on(t.mediaId, t.personId)],
);

// annotations -----------------------------------------------------------------
export const annotations = sqliteTable(
  "annotations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetType: text("target_type", { enum: ANNOTATION_TARGET_TYPES }).notNull(),
    targetId: integer("target_id").notNull(),
    body: text("body").notNull(),
    authorId: integer("author_id").references(() => users.id),
    annotationType: text("annotation_type", { enum: ANNOTATION_TYPES })
      .notNull()
      .default("personal_memory"),
    incorporatePref: text("incorporate_pref", { enum: INCORPORATE_PREFS })
      .notNull()
      .default("no_pref"),
    isDeleted: isDeleted(),
    createdOn: createdOn(),
    modifiedOn: modifiedOn(),
  },
  (t) => [
    index("annotations_target_idx").on(t.targetType, t.targetId),
    index("annotations_author_idx").on(t.authorId),
  ],
);

// annotation_people -----------------------------------------------------------
export const annotationPeople = sqliteTable(
  "annotation_people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    annotationId: integer("annotation_id")
      .notNull()
      .references(() => annotations.id),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
  },
  (t) => [
    uniqueIndex("annotation_people_unique_idx").on(
      t.annotationId,
      t.personId,
    ),
  ],
);

// invites ---------------------------------------------------------------------
export const invites = sqliteTable(
  "invites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    inviteeName: text("invitee_name").notNull(),
    invitedBy: integer("invited_by")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: text("token_expires_at").notNull(),
    status: text("status", { enum: INVITE_STATUSES }).notNull().default("pending"),
    errorMessage: text("error_message"),
    providerMessageId: text("provider_message_id"),
    createdOn: createdOn(),
  },
  (t) => [
    index("invites_email_created_idx").on(t.email, t.createdOn),
    uniqueIndex("invites_token_hash_idx").on(t.tokenHash),
  ],
);

// object_revisions ------------------------------------------------------------
export const objectRevisions = sqliteTable(
  "object_revisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetId: integer("target_id").notNull(),
    targetType: text("target_type", { enum: REVISION_TARGET_TYPES }).notNull(),
    action: text("action", { enum: REVISION_ACTIONS }).notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    changedBy: integer("changed_by"),
    changedAt: text("changed_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("object_revisions_target_idx").on(t.targetType, t.targetId),
    index("object_revisions_changed_at_idx").on(t.changedAt),
  ],
);

// Row types -------------------------------------------------------------------
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PersonRow = typeof people.$inferSelect;
export type PlaceRow = typeof places.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type EventPerformanceDetailsRow =
  typeof eventPerformanceDetails.$inferSelect;
export type EventSourceRow = typeof eventSources.$inferSelect;
export type EventPersonRow = typeof eventPeople.$inferSelect;
export type EventActRow = typeof eventActs.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type AnnotationRow = typeof annotations.$inferSelect;
export type ObjectRevisionRow = typeof objectRevisions.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type NewInviteRow = typeof invites.$inferInsert;
