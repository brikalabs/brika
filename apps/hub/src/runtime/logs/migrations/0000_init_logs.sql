CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`level` text NOT NULL,
	`source` text NOT NULL,
	`plugin_name` text,
	`message` text NOT NULL,
	`meta` text,
	`error_name` text,
	`error_message` text,
	`error_stack` text,
	`error_cause` text
);
--> statement-breakpoint
CREATE INDEX `idx_logs_ts` ON `logs` (`ts`);--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_logs_source` ON `logs` (`source`);--> statement-breakpoint
CREATE INDEX `idx_logs_plugin` ON `logs` (`plugin_name`);--> statement-breakpoint
CREATE INDEX `idx_logs_ts_level` ON `logs` (`ts`,`level`);--> statement-breakpoint
CREATE INDEX `idx_logs_ts_source` ON `logs` (`ts`,`source`);
