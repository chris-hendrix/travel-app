CREATE TYPE "public"."photo_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "trip_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"url" text,
	"caption" varchar(200),
	"status" "photo_status" DEFAULT 'processing' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_photos_trip_id_idx" ON "trip_photos" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_photos_uploaded_by_idx" ON "trip_photos" USING btree ("uploaded_by");