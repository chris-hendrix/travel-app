CREATE TABLE IF NOT EXISTS "poi_cache" (
  "trip_id" uuid PRIMARY KEY REFERENCES "trips"("id"),
  "source" text NOT NULL,
  "search_lat" double precision NOT NULL,
  "search_lon" double precision NOT NULL,
  "search_location" text,
  "cached_at" timestamp with time zone DEFAULT now() NOT NULL,
  "suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL
);--> statement-breakpoint
