-- Convert events.links and accommodations.links from text[] to jsonb
-- Storing structured { url, name? } objects instead of plain URL strings.
-- Existing plain URLs become [{"url": "..."}] (no name) so callers reading
-- the new shape see the URL fall back when name is absent.

ALTER TABLE "events" ADD COLUMN "links_new" jsonb;--> statement-breakpoint
UPDATE "events"
SET "links_new" = (
  SELECT jsonb_agg(jsonb_build_object('url', x))
  FROM unnest("links") AS x
)
WHERE "links" IS NOT NULL AND array_length("links", 1) > 0;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "links";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "links_new" TO "links";--> statement-breakpoint

ALTER TABLE "accommodations" ADD COLUMN "links_new" jsonb;--> statement-breakpoint
UPDATE "accommodations"
SET "links_new" = (
  SELECT jsonb_agg(jsonb_build_object('url', x))
  FROM unnest("links") AS x
)
WHERE "links" IS NOT NULL AND array_length("links", 1) > 0;--> statement-breakpoint
ALTER TABLE "accommodations" DROP COLUMN "links";--> statement-breakpoint
ALTER TABLE "accommodations" RENAME COLUMN "links_new" TO "links";
