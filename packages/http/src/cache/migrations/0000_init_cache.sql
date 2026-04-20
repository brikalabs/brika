CREATE TABLE `cache_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`timestamp` integer NOT NULL,
	`ttl` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cache_tags` (
	`key` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`key`) REFERENCES `cache_entries`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cache_expires` ON `cache_entries` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_cache_tags_tag` ON `cache_tags` (`tag`);
