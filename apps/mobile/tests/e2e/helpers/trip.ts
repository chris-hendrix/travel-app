/**
 * Trip seeding for E2E.
 *
 * Lifted out of `itinerary-journey.spec.ts` (and out of
 * `trip-journey.spec.ts`, which carried a second copy of the same
 * function) so the delete spec seeds the same way rather than adding a
 * third copy: a seeder that exists once per spec drifts the moment one
 * of them is edited. Two copies still live on —
 * `invitation-journey.spec.ts` and `notifications.spec.ts`, which
 * seed with their own extra members — so this is consolidation, not
 * elimination.
 */

import type { APIRequestContext } from "@playwright/test";
import { API_BASE } from "./timeouts";

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Seed a trip through the real create endpoint. Returns id + start. */
export async function seedTripViaAPI(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<{ id: string; startDate: string }> {
  // POST /api/trips — body mirrors createTripSchema
  // (shared/schemas/trip.ts): name, destination, timezone required.
  // Response is CreateTripResponse: {success, trip: {id, ...}} (the
  // shape lib/queries/trips.ts:createTrip reads as body.trip).
  const startDate = isoIn(30);
  const res = await request.post(`${API_BASE}/trips`, {
    data: {
      name,
      destination: "Mallorca, Spain",
      timezone: "America/Chicago",
      startDate,
      endDate: isoIn(35),
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`create-trip failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { trip: { id: string } };
  return { id: body.trip.id, startDate };
}

/**
 * The zone the API gave the trip. Not the one this helper posts: creation
 * prefers the zone geocoded from the destination and falls back to the
 * body's `timezone` (`trip.service.ts`), so a spec that needs the clock a
 * travel record will be read in has to ask the trip rather than assume
 * what it sent.
 */
export async function tripTimezoneViaAPI(
  request: APIRequestContext,
  token: string,
  tripId: string,
): Promise<string> {
  const res = await request.get(`${API_BASE}/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`get-trip failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { trip: { preferredTimezone: string } };
  return body.trip.preferredTimezone;
}
