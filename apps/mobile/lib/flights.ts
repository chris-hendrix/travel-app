import type {
  FlightLookupResponse,
  FlightLookupResult,
} from "@journiful/shared/types";
import { ApiError, apiFetch } from "@/lib/api";

const FLIGHT_NUMBER_REGEX = /^(?:[A-Z\d]{2}\d{1,4}|[A-Z]{3}\d{1,4})$/i;

/** Compact form the API wants: spaces/hyphens stripped, uppercased. */
export function normalizeFlightNumber(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * The number the way a person writes it, and the way the field's own
 * placeholder writes it: the airline code, a space, the number
 * ("UA 1842"). The space is not decoration — it is where the code ends,
 * and a run of six characters gives the eye nowhere to rest.
 *
 * The code is two characters (letters and digits mix — U2, 4U) or three
 * ICAO letters, so the split is read the same way `isFlightNumber`
 * reads it, in the same order: three letters first, then two
 * characters. That order is what keeps "U2123" as U2 + 123 rather than
 * a one-letter code with a four-digit number, which is not a code at
 * all.
 *
 * Idempotent, and total: an empty, partial or malformed value comes
 * back compact rather than rejected, because this runs on every
 * keystroke. Mid-typing "UA" is not a wrong number, it is an unfinished
 * one — and the trailing space is not added until there is a digit to
 * put after it, so the field never holds "UA " with nothing following.
 */
export function formatFlightNumber(value: string): string {
  const compact = normalizeFlightNumber(value);
  const code = /^[A-Z]{3}/.test(compact)
    ? compact.slice(0, 3)
    : compact.slice(0, 2);
  const number = compact.slice(code.length);
  return number ? `${code} ${number}` : code;
}

/**
 * Airline code + number, the way the API wants it: "UA123". The code
 * is two characters (letters and digits mix — U2, 4U — but never
 * digits alone) or three ICAO letters, then one to four digits. The
 * alternation pins the split so a fifth digit cannot hide inside the
 * code the way `[A-Z\d]{2,3}\d{1,4}` allowed ("UA12345").
 */
export function isFlightNumber(value: string): boolean {
  const compact = normalizeFlightNumber(value.trim());
  return FLIGHT_NUMBER_REGEX.test(compact) && /[A-Z]/i.test(compact.slice(0, 2));
}

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
