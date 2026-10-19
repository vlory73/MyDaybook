DROP TABLE `reminder_slots`;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `schedule` text DEFAULT '{"tz":"UTC","slots":[]}' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `last_fired` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `updated_at` integer DEFAULT 0 NOT NULL;