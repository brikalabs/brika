CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_theme` text,
	`color_mode` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
