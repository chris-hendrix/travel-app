-- Place block: one vocabulary across trips, events and accommodations.
-- The four renames are RENAME COLUMN, never DROP + ADD: the columns are
-- already applied in the local dev databases and a drop would take the
-- place links with it. drizzle-kit's own `generate` cannot express this
-- without an interactive conflict prompt, hence the custom migration.
ALTER TABLE "trips" RENAME COLUMN "destination_display_name" TO "place_name";--> statement-breakpoint
ALTER TABLE "trips" RENAME COLUMN "external_place_id" TO "place_id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "external_place_id" TO "place_id";--> statement-breakpoint
ALTER TABLE "accommodations" RENAME COLUMN "external_place_id" TO "place_id";--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "place_address" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "place_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "place_address" text;--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "place_name" text;--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "place_address" text;
