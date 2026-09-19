import type {
  FlightLookupResponse,
  FlightLookupResult,
} from "@journiful/shared/types";

const FLIGHT_NUMBER_REGEX = /^[A-Z\d]{2,3}\d{1,4}$/i;

/** Airline code + number, the way the API wants it: "UA123". */
export function isFlightNumber(value: string): boolean {
  return FLIGHT_NUMBER_REGEX.test(value.trim());
}

function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/+$/, "");
  return "http://localhost:8000/api";
}

/**
 * One flight on one date, or null when there is nothing to fill in
 * with — unknown flight, no date, API down, API unconfigured. Null is
 * an answer, not an error: the form stays fillable by hand either way,
 * which is the whole point of lookup being optional.
 */
export async function lookupFlight(
  flightNumber: string,
  date: string,
): Promise<FlightLookupResult | null> {
  if (!isFlightNumber(flightNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  try {
    const response = await fetch(`${apiBase()}/flights/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightNumber: flightNumber.trim(), date }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as FlightLookupResponse;
    if (!body.available || !body.flight) return null;
    return body.flight;
  } catch {
    return null;
  }
}
