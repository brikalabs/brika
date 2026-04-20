CREATE TABLE `plugins` (
	`name` text PRIMARY KEY NOT NULL,
	`root_directory` text NOT NULL,
	`entry_point` text NOT NULL,
	`uid` text NOT NULL,
	`enabled` integer NOT NULL DEFAULT true,
	`health` text NOT NULL DEFAULT 'restarting',
	`last_error` text,
	`updated_at` integer NOT NULL,
	`granted_permissions` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_uid_unique` ON `plugins` (`uid`);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
