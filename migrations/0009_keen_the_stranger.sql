DROP INDEX `invites_token_hash_idx`;--> statement-breakpoint
ALTER TABLE `invites` DROP COLUMN `token_hash`;--> statement-breakpoint
ALTER TABLE `invites` DROP COLUMN `token_expires_at`;