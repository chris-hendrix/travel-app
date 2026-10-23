import type {
  FlightLookupResponse,
  FlightLookupResult,
} from "@journiful/shared/types";
import {
  formatFlightNumber,
  isFlightNumber,
  normalizeFlightNumber,
} from "@journiful/shared/utils";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * The flight's number, in two halves: the **words** that format and
 * validate it are `@journiful/shared/utils`'s, and the **lookup** is this
 * module's.
 *
 * The three helpers moved out of the app because the API writes the same
 * number into a calendar event's description, and one number formatted two
 * ways — `UA 1842` in the form's field, `UA1842` in the feed — is the drift
 * the shared table exists to stop. They are re-exported here so the form,
 * the sheet and `newTravel.ts` keep their imports and still read the one
 * implementation. What stays is `lookupFlight`, because a network call is
 * not a word: the base URL, the timeout and the auth header all live at
 * the one network boundary, and the shared package has no fetch.
 */

export { formatFlightNumber, isFlightNumber, normalizeFlightNumber };

/**
 * One flight on one date, or null when there is nothing to fill in
 * with — unknown flight or unparseable input. Null is an answer, not
 * an error: the form stays fillable by hand either way, which is the
 * whole point of lookup being optional.
 *
 * Everything else — transport failures, timeouts, non-404 statuses —
 * is thrown to the caller (`NetworkError`, `TimeoutError`, `ApiError`
 * from `@/lib/api`), so a down API never reads as "no such flight".
 * Rides `apiFetch`, so the base URL, the timeout and the auth header
 * all live at the one network boundary.
 */
export async function lookupFlight(
  flightNumber: string,
  date: string,
): Promise<FlightLookupResult | null> {
  const normalized = normalizeFlightNumber(flightNumber);
  if (!isFlightNumber(flightNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  try {
    const body = await apiFetch<FlightLookupResponse>(`/flights/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightNumber: normalized, date }),
    });
    if (!body.available || !body.flight) return null;
    return body.flight;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
