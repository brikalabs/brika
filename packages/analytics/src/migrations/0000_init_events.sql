CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`distinct_id` text,
	`user_id` text,
	`plugin_name` text,
	`props` text
);
--> statement-breakpoint
CREATE INDEX `idx_events_ts` ON `events` (`ts`);--> statement-breakpoint
CREATE INDEX `idx_events_name` ON `events` (`name`);--> statement-breakpoint
CREATE INDEX `idx_events_source` ON `events` (`source`);--> statement-breakpoint
CREATE INDEX `idx_events_plugin` ON `events` (`plugin_name`);--> statement-breakpoint
CREATE INDEX `idx_events_user` ON `events` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_events_ts_name` ON `events` (`ts`,`name`);
