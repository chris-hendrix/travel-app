CREATE TABLE "payment_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" uuid,
	"guest_id" uuid,
	"share_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"user_id" uuid,
	"guest_id" uuid,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_guest_id_trip_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."trip_guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_guest_id_trip_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."trip_guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_guests" ADD CONSTRAINT "trip_guests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_guests" ADD CONSTRAINT "trip_guests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_participants_payment_id_idx" ON "payment_participants" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_participants_user_id_idx" ON "payment_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_participants_guest_id_idx" ON "payment_participants" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "payments_trip_id_not_deleted_idx" ON "payments" USING btree ("trip_id") WHERE "payments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_guest_id_idx" ON "payments" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "trip_guests_trip_id_idx" ON "trip_guests" USING btree ("trip_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_check" CHECK (("user_id" IS NOT NULL AND "guest_id" IS NULL) OR ("user_id" IS NULL AND "guest_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_participant_check" CHECK (("user_id" IS NOT NULL AND "guest_id" IS NULL) OR ("user_id" IS NULL AND "guest_id" IS NOT NULL));