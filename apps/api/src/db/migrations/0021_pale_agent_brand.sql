CREATE TABLE "weather_cache" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"response" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "destination_lat" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "destination_lon" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temperature_unit" varchar(10) DEFAULT 'celsius';--> statement-breakpoint
ALTER TABLE "weather_cache" ADD CONSTRAINT "weather_cache_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;