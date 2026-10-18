CREATE TABLE `recovery_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` blob NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_tokens_token_hash_unique` ON `recovery_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `recovery_tokens_user_idx` ON `recovery_tokens` (`user_id`);