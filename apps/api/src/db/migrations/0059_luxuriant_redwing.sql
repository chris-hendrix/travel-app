-- Settle stops soft-deleting.
--
-- `payments.member_id` is a RESTRICT foreign key to `members`, so a
-- soft-deleted expense kept blocking the removal of the person who paid it,
-- while every read filtered the row out of the ledger. The refusal was
-- therefore unactionable: it told the organizer to "edit or delete it first",
-- and deleting it did nothing. Payments are the only soft-deletable row that
-- another domain's constraint reads, which is why the pattern stops here.
--
-- The purge comes first, because the columns are what it reads. These rows are
-- unreachable in every surface (nothing lists deleted payments, and
-- `POST /payments/:id/restore` is removed in the same change), so nothing a
-- user can see is lost.
DELETE FROM "payments" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
DROP INDEX "payments_trip_id_not_deleted_idx";--> statement-breakpoint
CREATE INDEX "payments_trip_id_idx" ON "payments" USING btree ("trip_id");--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "deleted_by";

-- Rollback (forward-only, and the purged rows are not recoverable):
--
--   ALTER TABLE "payments" ADD COLUMN "deleted_at" timestamp with time zone;
--   ALTER TABLE "payments" ADD COLUMN "deleted_by" uuid;
--
-- That is enough to run a pre-`0059` API again: every surviving payment has
-- `deleted_at IS NULL`, so an old build reads exactly the rows this one does
-- and no money goes missing. What cannot come back is the deleted expenses
-- themselves, which no screen could show before this migration either.
