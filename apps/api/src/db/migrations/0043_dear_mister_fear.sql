-- Guest members Phase 1 Task 1.2: payments + payment_participants user_id -> member_id
-- Expand -> backfill -> contract in one atomic migration (single deploy window with Phase 6 code).
--> statement-breakpoint
-- (1) EXPAND: add nullable member_id columns + FKs + indexes
ALTER TABLE "payments" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_participants" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_member_id_idx" ON "payments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "payment_participants_member_id_idx" ON "payment_participants" USING btree ("member_id");--> statement-breakpoint
-- (2) BACKFILL: resolve each payment row's member via (trip_id, user_id).
-- 1:1 join guaranteed by members_trip_user_unique (one member row per (trip,user)).
UPDATE "payments" p SET "member_id" = m."id" FROM "members" m WHERE m."trip_id" = p."trip_id" AND m."user_id" = p."user_id";--> statement-breakpoint
UPDATE "payment_participants" pp SET "member_id" = m."id" FROM "members" m, "payments" p WHERE p."id" = pp."payment_id" AND m."trip_id" = p."trip_id" AND m."user_id" = pp."user_id";--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "payments" WHERE "member_id" IS NULL) OR EXISTS (SELECT 1 FROM "payment_participants" WHERE "member_id" IS NULL) THEN RAISE EXCEPTION 'orphan payment row: user no longer a member of its trip'; END IF; END $$;--> statement-breakpoint
-- (3) CONTRACT: enforce NOT NULL, drop user_id + its FKs/indexes
ALTER TABLE "payments" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_participants" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_user_id_users_id_fk";--> statement-breakpoint
DROP INDEX "payments_user_id_idx";--> statement-breakpoint
DROP INDEX "payment_participants_user_id_idx";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP COLUMN "user_id";
