import type { Trip } from "@/components/trip/TripCard";
import { TRIPS } from "@/mocks/trips";

/**
 * The seam every store adopts at backend wiring.
 *
 * A store's data comes from an injected source, never a module-level
 * mock import: the provider takes a `source` prop defaulting to the
 * mock, and the wiring swaps in an API-backed source without touching
 * the screens. `tripsStore` proves the shape; the seven stores that
 * adopt it later are events, travel, stays, members, notifications,
 * profile and trip settings.
 */
export type TripsSource = {
  list(): Trip[];
  create(trip: Trip): void;
  update(id: string, patch: Partial<Trip>): void;
};

/**
 * The in-memory source. Holds the mock pool plus authored trips plus
 * edits, reproducing today's store semantics: `create` prepends (newest
 * first) and `update` patches the trip with the matching id.
 */
export function createMockTripsSource(seed: Trip[] = TRIPS): TripsSource {
  let trips: Trip[] = [...seed];
  return {
    list: () => [...trips],
    create: (trip: Trip) => {
      trips = [trip, ...trips];
    },
    update: (id: string, patch: Partial<Trip>) => {
      trips = trips.map((trip): Trip =>
        trip.id === id ? { ...trip, ...patch } : trip,
      );
    },
  };
}

export const MockTripsSource: TripsSource = createMockTripsSource();
