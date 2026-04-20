CREATE TABLE `sparks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`plugin_id` text,
	`payload` text
);
--> statement-breakpoint
CREATE INDEX `idx_sparks_ts` ON `sparks` (`ts`);--> statement-breakpoint
CREATE INDEX `idx_sparks_type` ON `sparks` (`type`);--> statement-breakpoint
CREATE INDEX `idx_sparks_source` ON `sparks` (`source`);--> statement-breakpoint
CREATE INDEX `idx_sparks_plugin` ON `sparks` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `idx_sparks_ts_type` ON `sparks` (`ts`,`type`);
