DELETE FROM "payment_participants" WHERE "guest_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "payments" WHERE "guest_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_payer_check";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_participant_check";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_guest_id_trip_guests_id_fk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_guest_id_trip_guests_id_fk";--> statement-breakpoint
DROP INDEX "payment_participants_guest_id_idx";--> statement-breakpoint
DROP INDEX "payments_guest_id_idx";--> statement-breakpoint
ALTER TABLE "payment_participants" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_participants" DROP COLUMN "guest_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "guest_id";--> statement-breakpoint
ALTER TABLE "trip_guests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "trip_guests";
