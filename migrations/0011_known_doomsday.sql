ALTER TABLE `media` ADD `purpose` text DEFAULT 'gallery' NOT NULL;
--> statement-breakpoint
UPDATE `media` SET `purpose` = 'source'
WHERE `id` IN (
	SELECT `media_id` FROM `event_sources`
	WHERE `source_type` = 'media' AND `media_id` IS NOT NULL
)
AND `id` NOT IN (
	SELECT `event_poster_id` FROM `event_performance_details`
	WHERE `event_poster_id` IS NOT NULL
);
--> statement-breakpoint
UPDATE `events` SET `hero_image_id` = NULL, `modified_on` = CURRENT_TIMESTAMP
WHERE `hero_image_id` IN (SELECT `id` FROM `media` WHERE `purpose` = 'source');