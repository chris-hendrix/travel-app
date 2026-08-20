DO $$ BEGIN
  IF (SELECT count(*) FROM trip_guests) > 0 OR (SELECT count(*) FROM payments) > 0 OR (SELECT count(*) FROM payment_participants) > 0 THEN
    RAISE EXCEPTION 'migration 0041 placeholder_members requires empty settle tables (trip_guests, payments, payment_participants)';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_guest_id_trip_guests_id_fk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_guest_id_trip_guests_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "payment_participants_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "payment_participants_guest_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "payments_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "payments_guest_id_idx";--> statement-breakpoint
ALTER TABLE "trip_guests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "trip_guests" CASCADE;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "display_name" varchar(100);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "payment_participants" ADD COLUMN "member_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "member_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "members_trip_phone_unique" ON "members" USING btree ("trip_id","phone_number") WHERE "members"."phone_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_participants_member_id_idx" ON "payment_participants" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "payments_member_id_idx" ON "payments" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "payment_participants" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP COLUMN "guest_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "guest_id";
