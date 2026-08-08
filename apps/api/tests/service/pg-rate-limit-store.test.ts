import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { sql } from "drizzle-orm";
import { createPgRateLimitStoreClass } from "@/plugins/pg-rate-limit-store.js";

/** Promisify the callback-based incr method */
function incrAsync(
  store: InstanceType<ReturnType<typeof createPgRateLimitStoreClass>>,
  key: string,
  timeWindow?: number,
): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(
      key,
      (err: Error | null, result?: { current: number; ttl: number }) => {
        if (err) reject(err);
        else resolve(result!);
      },
      timeWindow,
    );
  });
}

describe("PgRateLimitStore", () => {
  const testKeyPrefix = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let StoreClass: ReturnType<typeof createPgRateLimitStoreClass>;
  let store: InstanceType<typeof StoreClass>;

  beforeEach(async () => {
    StoreClass = createPgRateLimitStoreClass(db);
    store = new StoreClass({ timeWindow: 60000 }); // 1 minute window
    // Clean up any test entries
    await db.execute(
      sql`DELETE FROM rate_limit_entries WHERE key LIKE ${testKeyPrefix + "%"}`,
    );
  });

  afterEach(async () => {
    await db.execute(
      sql`DELETE FROM rate_limit_entries WHERE key LIKE ${testKeyPrefix + "%"}`,
    );
  });

  it("should return current=1 on first increment", async () => {
    const key = `${testKeyPrefix}-first`;
    const result = await incrAsync(store, key);

    expect(result.current).toBe(1);
    expect(result.ttl).toBeGreaterThan(0);
    expect(result.ttl).toBeLessThanOrEqual(60000);
  });

  it("should increment count on subsequent calls", async () => {
    const key = `${testKeyPrefix}-incr`;

    const result1 = await incrAsync(store, key);
    expect(result1.current).toBe(1);

    const result2 = await incrAsync(store, key);
    expect(result2.current).toBe(2);

    const result3 = await incrAsync(store, key);
    expect(result3.current).toBe(3);
  });

  it("should reset count when window has expired", async () => {
    const key = `${testKeyPrefix}-expired`;

    // Insert an entry with an already-expired window
    const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
    await db.execute(sql`
      INSERT INTO rate_limit_entries (key, count, expires_at)
      VALUES (${key}, 5, ${pastDate})
    `);

    // Incrementing should reset count to 1 (expired window)
    const result = await incrAsync(store, key);
    expect(result.current).toBe(1);
    expect(result.ttl).toBeGreaterThan(0);
  });

  it("should handle concurrent access correctly", async () => {
    const key = `${testKeyPrefix}-concurrent`;

    // Fire 5 concurrent increments
    const promises = Array.from({ length: 5 }, () => incrAsync(store, key));
    const results = await Promise.all(promises);

    // All 5 promises resolved successfully with valid counts and TTLs
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.current).toBeGreaterThanOrEqual(1);
      expect(result.current).toBeLessThanOrEqual(5);
      expect(result.ttl).toBeGreaterThan(0);
    }

    // The final count in the database must be exactly 5
    const dbResult = await db.execute(
      sql`SELECT count FROM rate_limit_entries WHERE key = ${key}`,
    );
    expect(Number(dbResult.rows[0].count)).toBe(5);
  });

  it("should create child store with custom timeWindow", async () => {
    const childStore = store.child({ timeWindow: 30000 }); // 30 seconds
    const key = `${testKeyPrefix}-child`;

    const result = await incrAsync(childStore, key);
    expect(result.current).toBe(1);
    // TTL should be roughly 30 seconds (the child's timeWindow), not 60 seconds
    expect(result.ttl).toBeGreaterThan(0);
    expect(result.ttl).toBeLessThanOrEqual(30000);
  });

  it("should use timeWindow from incr argument when provided", async () => {
    const key = `${testKeyPrefix}-tw-arg`;

    // Store has 60s window, but pass 10s via incr argument
    const result = await incrAsync(store, key, 10000);
    expect(result.current).toBe(1);
    // TTL should be roughly 10 seconds, not 60 seconds
    expect(result.ttl).toBeGreaterThan(0);
    expect(result.ttl).toBeLessThanOrEqual(10000);
  });

  it("should handle string timeWindow in constructor gracefully", async () => {
    // When timeWindow is a string, the store falls back to 900000ms (15 min)
    const stringStore = new StoreClass({
      timeWindow: "15 minutes" as unknown as number,
    });
    const key = `${testKeyPrefix}-string-tw`;

    const result = await incrAsync(stringStore, key);
    expect(result.current).toBe(1);
    // TTL should be roughly 15 minutes (900000ms)
    expect(result.ttl).toBeGreaterThan(800000);
    expect(result.ttl).toBeLessThanOrEqual(900000);
  });
});
