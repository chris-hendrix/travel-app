ALTER TABLE "member_travel" ADD COLUMN "departure_location" text;--> statement-breakpoint
ALTER TABLE "member_travel" ADD COLUMN "departure_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_travel" ADD COLUMN "arrival_location" text;--> statement-breakpoint
ALTER TABLE "member_travel" ADD COLUMN "arrival_time" timestamp with time zone;--> statement-breakpoint
UPDATE "member_travel" SET "arrival_time" = "time", "arrival_location" = "location" WHERE "travel_type" = 'arrival';--> statement-breakpoint
UPDATE "member_travel" SET "departure_time" = "time", "departure_location" = "location" WHERE "travel_type" = 'departure';--> statement-breakpoint
DROP INDEX "member_travel_time_idx";--> statement-breakpoint
ALTER TABLE "member_travel" DROP COLUMN "time";--> statement-breakpoint
ALTER TABLE "member_travel" DROP COLUMN "location";--> statement-breakpoint
CREATE INDEX "member_travel_arrival_time_idx" ON "member_travel" USING btree ("arrival_time");--> statement-breakpoint
CREATE INDEX "member_travel_departure_time_idx" ON "member_travel" USING btree ("departure_time");--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "allow_members_to_add_events" SET DEFAULT false;
