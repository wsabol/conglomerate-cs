ALTER TABLE `narrative_jobs` ADD `source_snapshot` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Keep the former editorial copy recoverable without retaining a second summary.
INSERT INTO object_revisions (target_type, target_id, action, before_json, after_json)
SELECT 'event', id, 'update', json_object('summary', summary, 'editorialSummary', editorial_summary),
       json_object('summary', summary, 'migration', 'single editable summary')
FROM events WHERE editorial_summary IS NOT NULL;
--> statement-breakpoint
-- Seed source history for narratives already generated before this migration.
UPDATE narrative_jobs SET source_snapshot = (
  SELECT COALESCE(json_group_array(json_object(
    'id', a.id, 'revision', a.processed_revision, 'annotationType', a.annotation_type, 'text', a.body
  )), '[]') FROM annotations a
  LEFT JOIN media m ON a.target_type = 'media' AND a.target_id = m.id
  WHERE a.processed_revision > 0
    AND ((a.target_type = 'event' AND a.target_id = narrative_jobs.event_id)
      OR (a.target_type = 'media' AND m.event_id = narrative_jobs.event_id))
);
--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `editorial_summary`;