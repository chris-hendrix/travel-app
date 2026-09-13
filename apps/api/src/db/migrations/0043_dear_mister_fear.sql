-- Guest members Phase 1 Task 1.2: payments + payment_participants user_id -> member_id
-- NOT zero-downtime: this migration must run immediately before deploying the
-- code that reads member_id, with no mixed-version serving in between. The
-- old code reads user_id (dropped in the CONTRACT step); the new code reads
-- member_id (added in the EXPAND step). There is no single revision that
-- serves both, so: stop traffic / hold deploys, run this migration, then
-- deploy the Phase 6 code that reads member_id.
--
-- Remediation if the orphan-abort DO block fires (migration rolled back):
-- the backfill found a payment/participant whose user has no member row in
-- its trip. Diagnose with:
--   SELECT p.id, p.trip_id, p.user_id FROM payments p
--     LEFT JOIN members m ON m.trip_id = p.trip_id AND m.user_id = p.user_id
--     WHERE p.member_id IS NULL AND m.id IS NULL;
--   SELECT pp.id, pp.payment_id, pp.user_id FROM payment_participants pp
--     JOIN payments p ON p.id = pp.payment_id
--     LEFT JOIN members m ON m.trip_id = p.trip_id AND m.user_id = pp.user_id
--     WHERE pp.member_id IS NULL AND m.id IS NULL;
-- Then either re-create the missing members row (trip_id + user_id, restoring
-- the membership) or scrub the orphan payment/participant rows, and re-run.
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
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "payments" WHERE "member_id" IS NULL) THEN RAISE EXCEPTION 'orphan payment row in payments: user no longer a member of its trip'; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "payment_participants" WHERE "member_id" IS NULL) THEN RAISE EXCEPTION 'orphan payment row in payment_participants: user no longer a member of its trip'; END IF; END $$;--> statement-breakpoint
-- (3) CONTRACT: enforce NOT NULL, drop user_id + its FKs/indexes
ALTER TABLE "payments" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_participants" ALTER COLUMN "member_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_user_id_users_id_fk";--> statement-breakpoint
DROP INDEX "payments_user_id_idx";--> statement-breakpoint
DROP INDEX "payment_participants_user_id_idx";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "payment_participants" DROP COLUMN "user_id";
