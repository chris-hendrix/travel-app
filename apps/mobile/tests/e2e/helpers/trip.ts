/**
 * Trip seeding for E2E.
 *
 * Lifted out of `itinerary-journey.spec.ts` (and out of
 * `trip-journey.spec.ts`, which carried a second copy of the same
 * function) rather than copied a third time: a seeder that exists once
 * per spec drifts the moment one of them is edited, and the delete spec
 * needs exactly the same trip.
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
