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
  SavedPlace,
} from "@journiful/shared/types";

/**
 * One stored saved place: the wire's `SavedPlace` plus the Google pair
 * the server keeps as its own two columns. The demo serves `place` as
 * `null` — the real attach degrades to null without a cache, so the
 * wire read matches reality — but the duplicate rule (a pair one
 * person already saved to the trip) still has to read *something*, so
 * the pair lives beside the row exactly as a column pair would.
 */
export type DemoSavedPlaceRow = SavedPlace & {
  placeProvider: "google" | null;
  placeId: string | null;
};

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
  savedPlaces: Map<string, DemoSavedPlaceRow[]>;
  counters: {
    event: number;
    stay: number;
    travel: number;
    payment: number;
    savedPlace: number;
  };
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

/** The 403 envelope, beside the 404: the ApiError reads the same shape. */
export function forbidden(message: string): { status: 403; body: DemoBody } {
  return {
    status: 403,
    body: { success: false, error: { code: "FORBIDDEN", message } },
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
