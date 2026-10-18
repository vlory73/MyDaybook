ALTER TABLE `users` ADD `totp_pending_enc` blob;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_last_step` integer;