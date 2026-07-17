ALTER TABLE `media` ADD `video_codec` text;
ALTER TABLE `media` ADD `processing_provider` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `stream_uid` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `stream_state` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `processing_started_on` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `processed_on` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `processing_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `media` ADD `processing_error_code` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `processing_error_message` text;
--> statement-breakpoint
ALTER TABLE `media` ADD `stream_last_checked_on` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `media_stream_uid_uidx` ON `media` (`stream_uid`) WHERE `stream_uid` IS NOT NULL;
