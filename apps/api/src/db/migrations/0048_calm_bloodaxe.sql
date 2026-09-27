CREATE TABLE "place_cache" (
	"provider" text NOT NULL,
	"place_id" text NOT NULL,
	"schema_version" integer NOT NULL,
	"details" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_cache_provider_place_id_pk" PRIMARY KEY("provider","place_id")
);
--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "place_provider" text;--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "external_place_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "place_provider" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_place_id" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "place_provider" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "external_place_id" text;--> statement-breakpoint
CREATE INDEX "place_cache_fetched_at_idx" ON "place_cache" USING btree ("fetched_at");