CREATE TABLE "affiliate_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"suggestion_type" varchar(50) NOT NULL,
	"suggestion_key" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"partner_slug" varchar(50) NOT NULL,
	"suggestion_type" varchar(50) NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_dismissals" ADD CONSTRAINT "affiliate_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_dismissals" ADD CONSTRAINT "affiliate_dismissals_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_dismissals_user_trip_idx" ON "affiliate_dismissals" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_dismissals_unique_idx" ON "affiliate_dismissals" USING btree ("user_id","trip_id","suggestion_type","suggestion_key");--> statement-breakpoint
CREATE INDEX "affiliate_events_user_trip_idx" ON "affiliate_events" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "affiliate_events_created_at_idx" ON "affiliate_events" USING btree ("created_at");