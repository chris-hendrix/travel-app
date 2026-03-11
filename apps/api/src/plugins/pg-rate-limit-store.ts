import { sql } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";

/**
 * Factory that creates a PgRateLimitStore class with a captured Drizzle DB instance.
 *
 * `@fastify/rate-limit` instantiates the store via `new Store(globalParams)` where
 * `globalParams` includes `timeWindow`, `max`, etc. The factory closure provides
 * access to the database without needing it in the constructor signature.
 *
 * IMPORTANT: At runtime, `@fastify/rate-limit` passes 4 args to `incr`:
 *   incr(key, callback, timeWindow, max)
 * where `timeWindow` is in milliseconds. The TypeScript types only declare 2 params.
 */
export function createPgRateLimitStoreClass(db: AppDatabase) {
  return class PgRateLimitStore {
    // ES private field (required for exported anonymous class — TS4094)
    #timeWindow: number;

    constructor(options: { timeWindow?: number | string }) {
      // timeWindow may be a string like "15 minutes" or number in ms.
      // The safest approach is to use the numeric default since the actual
      // resolved timeWindow is passed as the 3rd arg to incr().
      this.#timeWindow =
        typeof options.timeWindow === "number" ? options.timeWindow : 900000; // 15 min default
    }

    /**
     * Increment a rate-limit counter using an atomic UPSERT.
     *
     * If the key does not exist, inserts with count=1.
     * If the key exists but the window has expired, resets to count=1 with a new window.
     * If the key exists and the window is active, increments the count.
     *
     * Returns `{ current, ttl }` where `ttl` is remaining milliseconds in the window.
     */
    incr(
      key: string,
      callback: (
        err: Error | null,
        result?: { current: number; ttl: number },
      ) => void,
      timeWindow?: number,
    ): void {
      const windowMs = timeWindow ?? this.#timeWindow;
      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowMs);

      db.execute<{ count: number; ttl: number }>(
        sql`
        INSERT INTO rate_limit_entries (key, count, expires_at)
        VALUES (${key}, 1, ${windowEnd})
        ON CONFLICT (key) DO UPDATE SET
          count = CASE
            WHEN rate_limit_entries.expires_at <= ${now} THEN 1
            ELSE rate_limit_entries.count + 1
          END,
          expires_at = CASE
            WHEN rate_limit_entries.expires_at <= ${now} THEN ${windowEnd}
            ELSE rate_limit_entries.expires_at
          END
        RETURNING count, EXTRACT(EPOCH FROM (expires_at - ${now}::timestamptz)) * 1000 AS ttl
      `,
      )
        .then((result) => {
          const row = result.rows[0] as { count: number; ttl: number };
          callback(null, {
            current: Number(row.count),
            ttl: Math.max(0, Number(row.ttl)),
          });
        })
        .catch((err) => callback(err as Error));
    }

    /**
     * Create a child store for a specific route.
     * The child inherits the DB connection but may have a different timeWindow.
     *
     * `@fastify/rate-limit` passes the full merged route options (RouteOptions & { path, prefix }).
     * We accept `object` (supertype of all interfaces) and extract only `timeWindow`.
     */
    child(routeOptions: object): InstanceType<typeof PgRateLimitStore> {
      const tw = (routeOptions as { timeWindow?: number | string }).timeWindow;
      return new PgRateLimitStore({
        timeWindow: tw ?? this.#timeWindow,
      });
    }
  };
}

/** Instance type for the dynamically created store class */
export type PgRateLimitStoreInstance = InstanceType<
  ReturnType<typeof createPgRateLimitStoreClass>
>;
