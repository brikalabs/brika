CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`error` text,
	`trigger_block_id` text,
	`event_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`block_id` text,
	`port` text,
	`data` text,
	`level` text,
	`message` text,
	`causation_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_runs_workflow` ON `runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_runs_correlation` ON `runs` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `idx_runs_started` ON `runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_runs_status` ON `runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_run_events_run` ON `run_events` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_run_events_run_ts` ON `run_events` (`run_id`,`ts`);