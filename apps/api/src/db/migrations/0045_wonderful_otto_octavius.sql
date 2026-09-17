DROP TABLE "poi_cache";
--> statement-breakpoint
CREATE TABLE "poi_cache" (
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"source" text NOT NULL,
	"location" text,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "poi_cache_lat_lon_pk" PRIMARY KEY("lat","lon")
);
--> statement-breakpoint
CREATE TABLE "poi_conversions" (
	"trip_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poi_conversions_trip_id_source_id_pk" PRIMARY KEY("trip_id","source_id")
);
--> statement-breakpoint
ALTER TABLE "poi_conversions" ADD CONSTRAINT "poi_conversions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_conversions" ADD CONSTRAINT "poi_conversions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poi_conversions_trip_id_idx" ON "poi_conversions" USING btree ("trip_id");
