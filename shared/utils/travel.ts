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

/** Google Maps search URL for a free-text location (keyless pattern). */
export function mapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
