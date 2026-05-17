-- Rename existing enum values (zero-downtime)
ALTER TYPE "event_type" RENAME VALUE 'meal' TO 'food_and_drink';--> statement-breakpoint
ALTER TYPE "event_type" RENAME VALUE 'activity' TO 'misc';--> statement-breakpoint

-- Add new enum values
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'arts_and_entertainment';--> statement-breakpoint
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'outdoors';--> statement-breakpoint
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'nightlife';
