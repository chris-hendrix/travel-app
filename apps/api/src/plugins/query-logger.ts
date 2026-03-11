import type { Logger as DrizzleLogger } from "drizzle-orm/logger";
import type { Pool } from "pg";

export const SLOW_QUERY_THRESHOLD_MS = 500;

interface PinoLikeLogger {
  debug(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export class PinoDrizzleLogger implements DrizzleLogger {
  private logger: PinoLikeLogger | null = null;

  setLogger(logger: PinoLikeLogger): void {
    this.logger = logger;
  }

  logQuery(query: string, params: unknown[]): void {
    this.logger?.debug({ query, params }, "db query");
  }

  warnSlowQuery(query: string | { text?: string }, durationMs: number): void {
    const sql = typeof query === "string" ? query : (query?.text ?? "unknown");
    this.logger?.warn(
      { query: sql, duration_ms: Math.round(durationMs) },
      "slow query detected",
    );
  }
}

export function instrumentPool(
  pool: Pool,
  queryLogger: PinoDrizzleLogger,
  thresholdMs: number = SLOW_QUERY_THRESHOLD_MS,
): void {
  const origQuery = pool.query.bind(pool);

  pool.query = function (...args: unknown[]): unknown {
    const start = performance.now();

    // Handle callback-based calls
    const lastArg = args[args.length - 1];
    if (typeof lastArg === "function") {
      const cb = lastArg as (...cbArgs: unknown[]) => void;
      args[args.length - 1] = (err: unknown, res: unknown) => {
        const durationMs = performance.now() - start;
        if (durationMs > thresholdMs) {
          queryLogger.warnSlowQuery(args[0] as string, durationMs);
        }
        cb(err, res);
      };
      return (origQuery as (...a: unknown[]) => unknown)(...args);
    }

    // Handle promise-based calls
    const result = (origQuery as (...a: unknown[]) => unknown)(...args);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(
        (res) => {
          const durationMs = performance.now() - start;
          if (durationMs > thresholdMs) {
            queryLogger.warnSlowQuery(args[0] as string, durationMs);
          }
          return res;
        },
        (err) => {
          const durationMs = performance.now() - start;
          if (durationMs > thresholdMs) {
            queryLogger.warnSlowQuery(args[0] as string, durationMs);
          }
          throw err;
        },
      );
    }
    return result;
  } as typeof pool.query;
}

export const queryLogger = new PinoDrizzleLogger();
