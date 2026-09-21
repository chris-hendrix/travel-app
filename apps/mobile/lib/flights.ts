import type {
  FlightLookupResponse,
  FlightLookupResult,
} from "@journiful/shared/types";
import { ApiError, apiFetch } from "@/lib/api";

const FLIGHT_NUMBER_REGEX = /^[A-Z\d]{2,3}\d{1,4}$/i;

/** Airline code + number, the way the API wants it: "UA123". */
export function isFlightNumber(value: string): boolean {
  return FLIGHT_NUMBER_REGEX.test(value.trim());
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
  if (!isFlightNumber(flightNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  try {
    const body = await apiFetch<FlightLookupResponse>(`/flights/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightNumber: flightNumber.trim(), date }),
    });
    if (!body.available || !body.flight) return null;
    return body.flight;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
