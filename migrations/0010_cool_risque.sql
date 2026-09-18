CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submitted_by` integer NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`what_happened` text,
	`reproduction_steps` text,
	`page_path` text NOT NULL,
	`notification_status` text DEFAULT 'pending' NOT NULL,
	`review_status` text DEFAULT 'open' NOT NULL,
	`issue_status` text DEFAULT 'none' NOT NULL,
	`issue_url` text,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feedback_created_on_idx` ON `feedback` (`created_on`);