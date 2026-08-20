import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/config/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../src/db/migrations");

/**
 * True when the table exists in the `public` schema. `trip_guests` is dropped
 * by this migration, so its presence also signals that the migration is pending.
 */
async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT to_regclass($1) AS reg",
    [`public.${name}`],
  );
  return result.rows[0]?.reg !== null;
}

async function columnNames(table: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map(
    (r: { column_name: string }) => r.column_name,
  );
}

async function columnIsNullable(
  table: string,
  column: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return result.rows[0]?.is_nullable === "YES";
}

describe("0041 placeholder members migration", () => {
  it("migrates empty settle tables to unified placeholder members", async () => {
    // 1. Pre-flight: the migration is only safe on empty settle tables.
    //    (Skipped when the migration has already been applied — `trip_guests`
    //    no longer exists in that case.)
    if (await tableExists("trip_guests")) {
      const tripGuests = await pool.query(
        "SELECT count(*)::int AS c FROM trip_guests",
      );
      const payments = await pool.query(
        "SELECT count(*)::int AS c FROM payments",
      );
      const participants = await pool.query(
        "SELECT count(*)::int AS c FROM payment_participants",
      );
      expect(tripGuests.rows[0]?.c).toBe(0);
      expect(payments.rows[0]?.c).toBe(0);
      expect(participants.rows[0]?.c).toBe(0);
    }

    // 2. Apply migrations (idempotent — a no-op when already applied).
    await migrate(db, { migrationsFolder });

    // 3. Assert the resulting schema shape.
    const membersColumns = await columnNames("members");
    expect(membersColumns).toContain("display_name");
    expect(membersColumns).toContain("phone_number");
    expect(await columnIsNullable("members", "user_id")).toBe(true);

    const paymentColumns = await columnNames("payments");
    expect(paymentColumns).toContain("member_id");
    expect(paymentColumns).not.toContain("user_id");
    expect(paymentColumns).not.toContain("guest_id");

    const participantColumns = await columnNames("payment_participants");
    expect(participantColumns).toContain("member_id");
    expect(participantColumns).not.toContain("user_id");
    expect(participantColumns).not.toContain("guest_id");

    const invitationColumns = await columnNames("invitations");
    expect(invitationColumns).toContain("member_id");

    expect(await tableExists("trip_guests")).toBe(false);
  });
});
