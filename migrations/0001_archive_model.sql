CREATE TABLE `annotation_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`annotation_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	FOREIGN KEY (`annotation_id`) REFERENCES `annotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annotation_people_unique_idx` ON `annotation_people` (`annotation_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`body` text NOT NULL,
	`author_id` integer,
	`annotation_type` text DEFAULT 'personal_memory' NOT NULL,
	`incorporate_pref` text DEFAULT 'no_pref' NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `annotations_target_idx` ON `annotations` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `annotations_author_idx` ON `annotations` (`author_id`);--> statement-breakpoint
CREATE TABLE `event_acts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`billing_role` text DEFAULT 'unknown' NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_acts_unique_idx` ON `event_acts` (`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `event_acts_event_id_idx` ON `event_acts` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'performer' NOT NULL,
	`notes` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_people_unique_idx` ON `event_people` (`event_id`,`person_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `event_people_person_id_idx` ON `event_people` (`person_id`);--> statement-breakpoint
CREATE TABLE `event_performance_details` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`billing_name` text,
	`promotion_text` text,
	`setlist_text` text,
	`event_poster_id` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`source_type` text DEFAULT 'text' NOT NULL,
	`description` text,
	`url` text,
	`media_id` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_sources_event_id_idx` ON `event_sources` (`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`event_type` text DEFAULT 'performance' NOT NULL,
	`event_date` text,
	`event_time` text,
	`date_precision` text DEFAULT 'exact' NOT NULL,
	`place_id` integer,
	`summary` text,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`hero_image_id` integer,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_idx` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_event_date_idx` ON `events` (`event_date`);--> statement-breakpoint
CREATE INDEX `events_modified_on_idx` ON `events` (`modified_on`);--> statement-breakpoint
CREATE INDEX `events_event_type_idx` ON `events` (`event_type`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer,
	`title` text,
	`media_type` text NOT NULL,
	`r2_key` text,
	`original_filename` text,
	`mime_type` text,
	`size` integer,
	`checksum` text,
	`status` text DEFAULT 'uploading' NOT NULL,
	`captured_date` text,
	`date_precision` text DEFAULT 'unknown' NOT NULL,
	`description` text,
	`provenance` text,
	`external_url` text,
	`display_key` text,
	`thumb_key` text,
	`created_by` integer,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_event_id_idx` ON `media` (`event_id`);--> statement-breakpoint
CREATE INDEX `media_media_type_idx` ON `media` (`media_type`);--> statement-breakpoint
CREATE INDEX `media_status_idx` ON `media` (`status`);--> statement-breakpoint
CREATE TABLE `media_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_people_unique_idx` ON `media_people` (`media_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `object_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`changed_by` integer,
	`changed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `object_revisions_target_idx` ON `object_revisions` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `object_revisions_changed_at_idx` ON `object_revisions` (`changed_at`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`aliases` text,
	`bio` text,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_display_name_idx` ON `people` (`display_name`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`place_type` text,
	`address` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `places_name_idx` ON `places` (`name`);