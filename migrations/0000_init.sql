CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`person_id` integer,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`modified_on` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);