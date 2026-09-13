ALTER TABLE "members" DROP CONSTRAINT "members_trip_user_unique";--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "guest_display_name" varchar(50);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "guest_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "members_trip_user_unique" ON "members" USING btree ("trip_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "members_trip_guest_phone_unique" ON "members" USING btree ("trip_id","guest_phone") WHERE guest_phone IS NOT NULL;