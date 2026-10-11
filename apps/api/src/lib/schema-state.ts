/**
 * Whether the database has the migrations this build expects.
 *
 * A deploy can ship code that reads a column the database does not have yet.
 * The migration that adds it travels in the same image, but nothing runs it:
 * Railway's pre-deploy command is a dashboard setting, and `start` is only
 * `node dist/server.js`. The API then answers 500 on every route that touches
 * the new column — and `/ready` reports `connected` the whole time, because a
 * pingable database says nothing about its shape.
 *
 * So the readiness probe asks this instead: is the newest migration this build
 * shipped present in the database's own migration ledger? That is the check
 * that turns "the deploy is serving 500s" into "the deploy is not ready", and
 * not-ready is the signal the platform rolls a deploy back on.
 *
 * The journal is **imported, not read from disk**. Imported, it is part of the
 * build itself, so the expectation cannot drift from the code and nothing
 * depends on where an image happens to keep its source tree — which is the
 * difference between a check that works in production and one that works only
 * in a checkout.
 */
import journal from "@/db/migrations/meta/_journal.json";

/** What the readiness probe can say about the schema. */
export type SchemaState = "current" | "behind" | "unknown";

/**
 * The newest timestamp among a journal's entries.
 *
 * A max, and not the last entry: this journal is **not monotonic**. `0034` and
 * `0037` were retrofitted with a `when` months earlier than the entry before
 * them, so the last entry is not automatically the newest one — and a
 * migration appended after them can carry the lowest timestamp of the three.
 * Reading the last entry would put the expectation *below* the newest
 * migration this build ships, and a database missing only that migration
 * would read `current`: the failure this check exists to catch, made silent.
 */
export function newestMigrationWhen(
  entries: readonly { when: number }[],
): number | undefined {
  let newest: number | undefined;
  for (const entry of entries) {
    if (newest === undefined || entry.when > newest) newest = entry.when;
  }
  return newest;
}

/** The newest migration this build ships, by the journal's own timestamp. */
export function expectedMigrationWhen(): number | undefined {
  return newestMigrationWhen(journal.entries);
}

/**
 * Whether the database is behind this build, given the newest migration it has
 * applied. `null` means it has applied none, which is behind.
 *
 * The comparison is against the newest entry, never a count: this repository's
 * production ledger is permanently short of the journal — `0034`, `0035` and
 * `0037` predate the switch from `db:push` to `migrate` — so a count would
 * report a healthy database as behind forever.
 *
 * Only positive evidence counts. An unreadable journal (`expectedWhen`
 * undefined) is not a reason to fail a deploy: a probe that blocks deploys
 * because it cannot answer is worse than the bug it exists to catch.
 */
export function isSchemaBehind(
  newestAppliedWhen: number | null,
  expectedWhen: number | undefined,
): boolean {
  if (expectedWhen === undefined) return false;
  if (newestAppliedWhen === null) return true;
  return newestAppliedWhen < expectedWhen;
}

/**
 * The schema state, read through an injected query.
 *
 * `unknown` covers everything that is not a definite answer — a missing ledger
 * table (a database drizzle never migrated), a query that threw — and the
 * caller treats it as not-behind, for the reason above.
 */
export async function readSchemaState(
  newestApplied: () => Promise<number | null>,
): Promise<SchemaState> {
  const expected = expectedMigrationWhen();
  if (expected === undefined) return "unknown";

  let applied: number | null;
  try {
    applied = await newestApplied();
  } catch {
    return "unknown";
  }

  if (applied !== null && Number.isNaN(applied)) return "unknown";
  return isSchemaBehind(applied, expected) ? "behind" : "current";
}
