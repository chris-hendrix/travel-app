import type { FlightLookupResult } from "../schemas/flight.js";

export type MemberTravelType = "arrival" | "departure";

export interface FlightAutofillFields {
  departureTime?: string | undefined;
  departureLocation?: string | undefined;
  arrivalTime?: string | undefined;
  arrivalLocation?: string | undefined;
  flightNumber?: string | undefined;
}

function formatAirport(airport: { iata: string | null; name: string }): string {
  return airport.iata ? `${airport.name} (${airport.iata})` : airport.name;
}

/**
 * Splits a flight-lookup result into form fields by travel direction.
 * Returns the full set; callers bind the pertinent pair to visible fields
 * and keep the counterpart pair in hidden form state for silent persistence.
 *
 * - arrival record: arrival side is shown, departure side hidden
 * - departure record: departure side is shown, arrival side hidden
 */
export function applyFlightLookup(
  _travelType: MemberTravelType,
  result: FlightLookupResult,
  flightNumber: string,
): FlightAutofillFields {
  return {
    departureTime: new Date(result.departureTime).toISOString(),
    departureLocation: formatAirport(result.departureAirport),
    arrivalTime: new Date(result.arrivalTime).toISOString(),
    arrivalLocation: formatAirport(result.arrivalAirport),
    flightNumber: flightNumber || undefined,
  };
}

/** Pertinent (visible) time for a travel record by its type. */
export function getPertinentTime(travel: {
  travelType: MemberTravelType;
  arrivalTime: Date | string | null;
  departureTime: Date | string | null;
}): Date | string | null {
  return travel.travelType === "arrival"
    ? travel.arrivalTime
    : travel.departureTime;
}

/** Pertinent (visible) location for a travel record by its type. */
export function getPertinentLocation(travel: {
  travelType: MemberTravelType;
  arrivalLocation: string | null;
  departureLocation: string | null;
}): string | null {
  return travel.travelType === "arrival"
    ? travel.arrivalLocation
    : travel.departureLocation;
}

/** Counterpart (hidden, lookup-set) time for a travel record by its type. */
export function getCounterpartTime(travel: {
  travelType: MemberTravelType;
  arrivalTime: Date | string | null;
  departureTime: Date | string | null;
}): Date | string | null {
  return travel.travelType === "arrival"
    ? travel.departureTime
    : travel.arrivalTime;
}

/** Counterpart (hidden, lookup-set) location for a travel record by its type. */
export function getCounterpartLocation(travel: {
  travelType: MemberTravelType;
  arrivalLocation: string | null;
  departureLocation: string | null;
}): string | null {
  return travel.travelType === "arrival"
    ? travel.departureLocation
    : travel.arrivalLocation;
}

/**
 * How many locations the `Where` field's cross-trip source serves, at
 * most — the answer's cap, not a read's bound.
 */
export const MY_TRAVEL_LOCATIONS_LIMIT = 20;

/**
 * The distinct wheres a set of travel rows holds, newest first.
 *
 * One rule in one place, because two surfaces answer it: `GET
 * /member-travel/locations`, which reads the caller's rows across trips,
 * and the demo adapter that stands in for that endpoint with no network
 * under it. Deduped case-insensitively — "BCN T2" and "bcn t2" are one
 * airport — trimmed, capped, and ordered by `updatedAt` descending, which
 * is what decides which spelling of a duplicated where survives.
 *
 * Both ends of a leg count, and the record's own end leads its
 * counterpart: the end the member filed, before the one a lookup filled
 * in silently. A row with no usable end contributes nothing and does not
 * consume the cap, which is why the cap counts locations rather than
 * rows.
 *
 * Order-owning on purpose: a caller may hand rows over in any order, so
 * the one that can only sort in SQL and the one that only has an array
 * cannot disagree about what "newest first" means. The sort is stable,
 * so rows sharing an `updatedAt` keep the order they arrived in.
 */
export function rankTravelLocations(
  rows: readonly {
    travelType: MemberTravelType;
    arrivalLocation: string | null;
    departureLocation: string | null;
    updatedAt: Date | string;
  }[],
  limit: number = MY_TRAVEL_LOCATIONS_LIMIT,
): string[] {
  const newestFirst = [...rows].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  const seen = new Set<string>();
  const locations: string[] = [];
  for (const row of newestFirst) {
    const ends = [getPertinentLocation(row), getCounterpartLocation(row)];
    for (const end of ends) {
      const location = end?.trim();
      if (!location) continue;
      const key = location.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      locations.push(location);
      if (locations.length >= limit) return locations;
    }
  }
  return locations;
}

/** Google Maps search URL for a free-text location (keyless pattern). */
export function mapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
