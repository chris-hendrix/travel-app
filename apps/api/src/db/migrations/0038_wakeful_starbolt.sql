ALTER TABLE "push_subscriptions" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "provider" text DEFAULT 'vapid' NOT NULL;