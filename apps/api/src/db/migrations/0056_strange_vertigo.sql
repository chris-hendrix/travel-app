-- One live row per member and direction.
--
-- The create path finds the live row for a pair and updates it in place,
-- but that read-then-write cannot order two concurrent POSTs: both miss
-- the lookup and both insert. This index is what settles that race, and
-- the database being migrated may already hold the artifact it prevents —
-- rows written before the rule existed.
--
-- CREATE UNIQUE INDEX aborts on the first duplicate, so the duplicates are
-- reconciled first. The newest live row of each pair survives (ordered by
-- updated_at, then created_at, then id, so the survivor is deterministic);
-- every other live row of that pair is soft-deleted. Soft-deleted rather
-- than hard-deleted because the app filters on `deleted_at` and the row a
-- member filed is not ours to destroy; `deleted_by` stays NULL, since this
-- is the server tidying its own artifact rather than a member's action.
--
-- Idempotent: on a database that already satisfies the rule this matches
-- zero rows, and on a clean database — every fresh install, every CI run —
-- it matches zero rows on its first run. Nothing here needs to change when
-- there is nothing to reconcile.
UPDATE "member_travel" AS mt
SET "deleted_at" = now()
WHERE mt."deleted_at" IS NULL
  AND mt."id" <> (
    SELECT keeper."id"
    FROM "member_travel" AS keeper
    WHERE keeper."trip_id" = mt."trip_id"
      AND keeper."member_id" = mt."member_id"
      AND keeper."travel_type" = mt."travel_type"
      AND keeper."deleted_at" IS NULL
    ORDER BY keeper."updated_at" DESC, keeper."created_at" DESC, keeper."id" DESC
    LIMIT 1
  );--> statement-breakpoint
CREATE UNIQUE INDEX "member_travel_pair_live_unique" ON "member_travel" USING btree ("trip_id","member_id","travel_type") WHERE "member_travel"."deleted_at" IS NULL;
