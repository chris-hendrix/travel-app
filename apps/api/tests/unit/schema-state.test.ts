import { describe, expect, it } from "vitest";
import journal from "@/db/migrations/meta/_journal.json";
import {
  expectedMigrationWhen,
  isSchemaBehind,
  newestMigrationWhen,
  readSchemaState,
} from "@/lib/schema-state.js";

/**
 * The readiness probe's decision, at the level it can honestly be held at.
 *
 * A live database cannot be *behind* in a test run — the suite migrates the one
 * it uses — so the case this exists for is unreachable through the route. What
 * is reachable is the decision itself: the injected thunk is where a database
 * that is behind, never migrated, or unreadable enters.
 */
describe("schema state", () => {
  const newest = expectedMigrationWhen();

  it("takes its expectation from the build's own journal, not a typed number", () => {
    // Asserting against the journal rather than a literal keeps this honest
    // when a migration lands: the test follows the file, and a pinned number
    // would rot into a test that passes while the check is wrong.
    const whens = journal.entries.map((entry) => entry.when);
    expect(newest).toBe(Math.max(...whens));
  });

  it("takes the newest entry, not the last one", () => {
    // The case the implementation is a max for. This journal really does hold
    // entries whose `when` precedes their predecessor's — `0034` and `0037`,
    // retrofitted by hand — so an appended migration can carry the lowest of
    // the three timestamps. Reading the last entry would set the expectation
    // below the newest migration the build ships, and a database missing only
    // that migration would read "current".
    expect(newestMigrationWhen([{ when: 2 }, { when: 3 }, { when: 1 }])).toBe(
      3,
    );
  });

  it("expects nothing from an empty journal", () => {
    expect(newestMigrationWhen([])).toBeUndefined();
  });

  it("is not behind when the newest migration has been applied", () => {
    expect(isSchemaBehind(newest!, newest)).toBe(false);
    expect(isSchemaBehind(newest! + 1, newest)).toBe(false);
  });

  it("is behind when the newest migration has not", () => {
    expect(isSchemaBehind(newest! - 1, newest)).toBe(true);
    // Never migrated at all.
    expect(isSchemaBehind(null, newest)).toBe(true);
  });

  it("does not call a deploy unready when it cannot tell", () => {
    // An unreadable or empty journal is not evidence of anything. A probe that
    // blocks deploys because it cannot answer is worse than the bug it exists
    // to catch.
    expect(isSchemaBehind(null, undefined)).toBe(false);
    expect(isSchemaBehind(123, undefined)).toBe(false);
  });

  it("reports current, behind and unknown through the injected query", async () => {
    await expect(readSchemaState(async () => newest!)).resolves.toBe("current");
    await expect(readSchemaState(async () => newest! - 1)).resolves.toBe(
      "behind",
    );
    await expect(readSchemaState(async () => null)).resolves.toBe("behind");
    await expect(
      readSchemaState(async () => {
        throw new Error("no drizzle ledger table");
      }),
    ).resolves.toBe("unknown");
    await expect(readSchemaState(async () => Number.NaN)).resolves.toBe(
      "unknown",
    );
  });
});
