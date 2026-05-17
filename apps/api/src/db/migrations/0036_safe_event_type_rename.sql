-- Safely rename 'meal' → 'food_and_drink' only if old value still exists and new doesn't
DO $$
DECLARE
    old_exists boolean;
    new_exists boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'meal' AND enumtypid = 'event_type'::regtype) INTO old_exists;
    SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'food_and_drink' AND enumtypid = 'event_type'::regtype) INTO new_exists;
    IF old_exists AND NOT new_exists THEN
        ALTER TYPE "event_type" RENAME VALUE 'meal' TO 'food_and_drink';
    END IF;
END $$;--> statement-breakpoint

-- Safely rename 'activity' → 'misc' only if old value still exists and new doesn't
DO $$
DECLARE
    old_exists boolean;
    new_exists boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'activity' AND enumtypid = 'event_type'::regtype) INTO old_exists;
    SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'misc' AND enumtypid = 'event_type'::regtype) INTO new_exists;
    IF old_exists AND NOT new_exists THEN
        ALTER TYPE "event_type" RENAME VALUE 'activity' TO 'misc';
    END IF;
END $$;--> statement-breakpoint

-- Add new enum values (already idempotent with IF NOT EXISTS)
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'arts_and_entertainment';--> statement-breakpoint
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'outdoors';--> statement-breakpoint
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'nightlife';

-- Update any existing rows that still use old enum values (edge case safety net)
UPDATE "events" SET "event_type" = 'food_and_drink' WHERE "event_type" = 'meal';
UPDATE "events" SET "event_type" = 'misc' WHERE "event_type" = 'activity';
