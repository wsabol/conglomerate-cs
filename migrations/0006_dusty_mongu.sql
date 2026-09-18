CREATE TABLE `narrative_jobs` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`requested_version` integer DEFAULT 1 NOT NULL,
	`completed_version` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_on` text,
	`error_code` text,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `narrative_jobs_due_idx` ON `narrative_jobs` (`status`,`next_retry_on`);--> statement-breakpoint
ALTER TABLE `annotations` ADD `summary_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `annotations` ADD `input_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `annotations` ADD `processed_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `editorial_summary` text;
--> statement-breakpoint
UPDATE `events` SET `editorial_summary` = `summary`;
--> statement-breakpoint
UPDATE `annotations` SET `summary_status` = 'excluded' WHERE `incorporate_pref` = 'separate';
--> statement-breakpoint
INSERT INTO `narrative_jobs` (`event_id`)
SELECT DISTINCT e.id FROM events e
WHERE e.is_deleted = 0 AND EXISTS (
  SELECT 1 FROM annotations a
  LEFT JOIN media m ON a.target_type = 'media' AND a.target_id = m.id
  WHERE a.is_deleted = 0 AND a.incorporate_pref <> 'separate'
    AND ((a.target_type = 'event' AND a.target_id = e.id)
      OR (a.target_type = 'media' AND m.event_id = e.id AND m.is_deleted = 0))
);
