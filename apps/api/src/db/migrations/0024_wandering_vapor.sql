CREATE TABLE "flight_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flight_number" text NOT NULL,
	"date" date NOT NULL,
	"response" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_cache_flight_number_date_unique" UNIQUE("flight_number","date")
);
--> statement-breakpoint
ALTER TABLE "member_travel" ADD COLUMN "flight_number" text;