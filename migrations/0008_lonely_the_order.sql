ALTER TABLE `narrative_jobs` ADD `has_generated_summary` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE narrative_jobs SET has_generated_summary = 1 WHERE EXISTS (
  SELECT 1 FROM object_revisions r WHERE r.target_type = 'event'
    AND r.target_id = narrative_jobs.event_id
    AND json_valid(r.after_json) AND json_extract(r.after_json, '$.generated') = 1
);
