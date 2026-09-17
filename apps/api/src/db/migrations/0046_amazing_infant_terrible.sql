CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"display_name" text NOT NULL,
	"timezone" varchar(100),
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
