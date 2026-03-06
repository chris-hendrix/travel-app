ALTER TABLE "members" ADD COLUMN "calendar_excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_token" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_calendar_token_unique" UNIQUE("calendar_token");
