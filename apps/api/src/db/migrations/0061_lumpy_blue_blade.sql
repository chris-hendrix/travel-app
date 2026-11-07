CREATE TABLE "saved_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"place_provider" text,
	"place_id" text,
	"place_type" "event_type" DEFAULT 'misc' NOT NULL,
	"notes" text,
	"pinned_at" timestamp with time zone,
	"pinned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_places_trip_id_idx" ON "saved_places" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "saved_places_created_by_idx" ON "saved_places" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "saved_places_trip_id_pinned_at_idx" ON "saved_places" USING btree ("trip_id","pinned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_places_member_place_unique" ON "saved_places" USING btree ("trip_id","created_by","place_id") WHERE "saved_places"."place_id" IS NOT NULL;
