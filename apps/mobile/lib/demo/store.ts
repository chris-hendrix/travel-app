/**
 * The demo store: the shape every handler reads, and the primitives they
 * read it through — the clock stamp, the 404 envelope, and the
 * id-addressed row scan.
 *
 * It sits beside the dispatcher rather than inside it because the money
 * domain (`lib/demo/money.ts`) reads the same store, and neither module
 * may import the other: `adapter.ts` value-imports `money.ts` for its six
 * money routes, so a store type left in `adapter.ts` would make `money.ts`
 * import the dispatcher back — a cycle whose failure mode is an undefined
 * binding at the first call rather than a compile error.
 *
 * The store itself is still the adapter's: `createDemoStore` builds it and
 * `installDemoFetch` holds it, and the ledger's map and counter live on it
 * here exactly as they did there.
 */

import type { DemoTrip } from "@/lib/demo";
import type {
  Accommodation,
  Event,
  MemberTravel,
  MemberWithProfile,
  Payment,
} from "@journiful/shared/types";

export type DemoStore = {
  trips: DemoTrip[];
  events: Map<string, Event[]>;
  stays: Map<string, Accommodation[]>;
  travel: Map<string, MemberTravel[]>;
  members: Map<string, MemberWithProfile[]>;
  payments: Map<string, Payment[]>;
  sharePhone: Map<string, boolean>;
  notifications: Map<
    string,
    { dailyItinerary: boolean; tripMessages: boolean }
  >;
  counters: { event: number; stay: number; travel: number; payment: number };
};

/** A parsed request body: handlers read the fields they expect off it. */
export type DemoBody = Record<string, unknown>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function notFound(message: string): { status: 404; body: DemoBody } {
  return {
    status: 404,
    body: { success: false, error: { code: "NOT_FOUND", message } },
  };
}

export function findRowAnywhere<T extends { id: string }>(
  rows: Map<string, T[]>,
  id: string,
): { tripId: string; list: T[]; row: T } | null {
  for (const [tripId, list] of rows) {
    const row = list.find((entry) => entry.id === id);
    if (row) return { tripId, list, row };
  }
  return null;
}
