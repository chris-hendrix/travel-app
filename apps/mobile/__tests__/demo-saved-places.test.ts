import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "@/lib/api";
import { buildDemoTrips, DEMO_TRIP_ID, DEMO_TRIP_IDS } from "@/lib/demo";
import {
  buildDemoStore,
  installDemoFetch,
  resetDemoLog,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
import { DEMO_PLACES } from "@/lib/demo/adapter";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** One saved place as the demo's wire read serves it (the fields read here). */
type WireSavedPlace = {
  id: string;
  tripId: string;
  /** A **user** id, never a member id. */
  createdBy: string;
  name: string;
  address: string | null;
  notes: string | null;
  placeType: string;
  place: null;
  isPinned: boolean;
  createdAt: string;
  /** Demo-only: the stored pair columns the duplicate rule reads — the real wire carries no `placeId`. */
  placeId?: string | null;
};

async function listSavedPlaces(tripId: string): Promise<WireSavedPlace[]> {
  const response = await apiFetch<{
    success: true;
    savedPlaces: WireSavedPlace[];
  }>(`/trips/${tripId}/saved-places`);
  return response.savedPlaces;
}

/**
 * The demo's saved places: the fixture's shape, the duplicate rule, the
 * pair semantics, and the two permission rules — read through the real
 * `apiFetch` against the interceptor, the way the Places door's own
 * queries and writes fire it.
 */
describe("the demo's saved places", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000/api";
    resetDemoLog();
    installDemoFetch(buildDemoStore(new Date("2026-10-06T12:00:00.000Z")));
  });

  afterEach(() => {
    uninstallDemoFetch();
  });

  it("seeds every trip with fixture rows whose creators are user ids", () => {
    const trips = buildDemoTrips(new Date("2026-10-06T12:00:00.000Z"));
    for (const trip of trips) {
      expect(trip.savedPlaces.length).toBeGreaterThan(0);
      const userIds = new Set(
        trip.members.map((member) => member.userId),
      );
      for (const place of trip.savedPlaces) {
        // The roster join keys on member.userId; a member id here is
        // the crossing the two id spaces exist to prevent.
        expect(userIds.has(place.createdBy)).toBe(true);
      }
    }
  });

  it("pins exactly one row across the fixture, created by a trip's organizer", () => {
    const trips = buildDemoTrips(new Date("2026-10-06T12:00:00.000Z"));
    const pinned = trips.flatMap((trip) =>
      trip.savedPlaces.filter((place) => place.isPinned),
    );
    expect(pinned).toHaveLength(1);
    const owner = trips
      .find((trip) =>
        trip.savedPlaces.some((place) => place.isPinned),
      )
      ?.members.find((member) => member.userId === pinned[0]!.createdBy);
    expect(owner?.isOrganizer).toBe(true);
    // So the Pinned chip reads both ways: one card shows it, another
    // hides it (`hasAnyPinned`).
    const pinnedTrips = trips.filter((trip) =>
      trip.savedPlaces.some((place) => place.isPinned),
    );
    expect(pinnedTrips.length).toBeLessThan(trips.length);
  });

  it("links its Google-paired rows back to the picker's own list", () => {
    const trips = buildDemoTrips(new Date("2026-10-06T12:00:00.000Z"));
    for (const trip of trips) {
      const linked = trip.savedPlaces.filter(
        (place) => place.placeProvider === "google",
      );
      expect(linked.length).toBeGreaterThanOrEqual(1);
      expect(linked.length).toBeLessThanOrEqual(2);
      for (const place of linked) {
        const known = DEMO_PLACES.find((entry) => entry.placeId === place.placeId);
        // The demo stays one fiction: a linked row's id, name and
        // address are the same venue the events' snapshots and the
        // autocomplete answer carry.
        expect(known).toBeDefined();
        expect(place.name).toBe(known!.shortName);
        expect(place.address).toBe(known!.displayAddress);
        expect(place.placeType).not.toBe("misc");
      }
    }
  });

  it("serves the list pinned-first then newest, with place always null", async () => {
    const rows = await listSavedPlaces(DEMO_TRIP_ID);
    expect(rows.map((row) => row.id)).toEqual([
      "demo-sp-cabo-solomons",
      "demo-sp-cabo-coffee",
      "demo-sp-cabo-switchback",
      "demo-sp-cabo-paisa",
      "demo-sp-cabo-beach",
    ]);
    for (const row of rows) {
      // The real server's attach degrades to null without a cache;
      // the demo matches reality.
      expect(row.place).toBeNull();
    }
  });

  it("creates a typed place: 201, counter id, unpinned, viewer's own row", async () => {
    const before = await listSavedPlaces(DEMO_TRIP_ID);
    const response = await apiFetch<{
      success: true;
      savedPlace: WireSavedPlace;
    }>(`/trips/${DEMO_TRIP_ID}/saved-places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "The taco truck on the hill" }),
    });
    expect(response.savedPlace.id).toBe("demo-sp-1");
    expect(response.savedPlace.createdBy).toBe("demo-viewer");
    expect(response.savedPlace.isPinned).toBe(false);
    expect(response.savedPlace.place).toBeNull();
    const after = await listSavedPlaces(DEMO_TRIP_ID);
    expect(after).toHaveLength(before.length + 1);
  });

  it("refuses a repeated Google pair with the 409 the form reads", async () => {
    const first = await apiFetch<{ success: true; savedPlace: WireSavedPlace }>(
      `/trips/${DEMO_TRIP_ID}/saved-places`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Taquería El Paisa",
          address: "Boulevard Lázaro Cárdenas, Cabo San Lucas, BCS, Mexico",
          placeProvider: "google",
          placeId: "demo-place-el-paisa",
        }),
      },
    );
    expect(first.savedPlace.id).toBe("demo-sp-1");

    let caught: unknown = null;
    try {
      await apiFetch(`/trips/${DEMO_TRIP_ID}/saved-places`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Taquería El Paisa",
          placeProvider: "google",
          placeId: "demo-place-el-paisa",
        }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.status).toBe(409);
    expect(error.code).toBe("SAVED_PLACE_DUPLICATE");
    expect(typeof error.message).toBe("string");
  });

  it("edits a row's scalars and clears its pair with explicit nulls", async () => {
    const created = await apiFetch<{
      success: true;
      savedPlace: WireSavedPlace;
    }>(`/trips/${DEMO_TRIP_ID}/saved-places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "The taco truck",
        address: "Somewhere up the hill",
        placeProvider: "google",
        placeId: "demo-place-el-paisa",
      }),
    });
    const id = created.savedPlace.id;

    // A partial body: the name moves, everything absent stays.
    const renamed = await apiFetch<{ success: true; savedPlace: WireSavedPlace }>(
      `/saved-places/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "The taco truck on the hill" }),
      },
    );
    expect(renamed.savedPlace.name).toBe("The taco truck on the hill");
    expect(renamed.savedPlace.address).toBe("Somewhere up the hill");
    expect(renamed.savedPlace.placeId).toBe("demo-place-el-paisa");

    // An explicit null clears; the row's original creator never moves.
    const cleared = await apiFetch<{ success: true; savedPlace: WireSavedPlace }>(
      `/saved-places/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeProvider: null, placeId: null }),
      },
    );
    expect(cleared.savedPlace.placeId).toBeNull();
    expect(cleared.savedPlace.createdBy).toBe("demo-viewer");
  });

  it("answers 403 when the viewer is neither the author nor the organizer", async () => {
    let caught: unknown = null;
    try {
      await apiFetch("/saved-places/demo-sp-cabo-solomons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Not mine to rename" }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);
  });

  it("keeps the pin the organizer's alone, and answers it 403 here", async () => {
    let caught: unknown = null;
    try {
      await apiFetch("/saved-places/demo-sp-cabo-solomons/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: true }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);

    const rows = await listSavedPlaces(DEMO_TRIP_ID);
    expect(rows.find((row) => row.id === "demo-sp-cabo-solomons")?.isPinned).toBe(
      true,
    );
  });

  it("deletes the viewer's own row, and a second delete is a 404", async () => {
    const created = await apiFetch<{
      success: true;
      savedPlace: WireSavedPlace;
    }>(`/trips/${DEMO_TRIP_ID}/saved-places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "The taco truck" }),
    });

    const gone = await apiFetch<{ success: true }>(
      `/saved-places/${created.savedPlace.id}`,
      { method: "DELETE" },
    );
    expect(gone.success).toBe(true);

    let caught: unknown = null;
    try {
      await apiFetch(`/saved-places/${created.savedPlace.id}`, {
        method: "DELETE",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
  });

  it("serves every demo trip's shelf, not just the first card's", async () => {
    for (const tripId of DEMO_TRIP_IDS) {
      const rows = await listSavedPlaces(tripId);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tripId).toBe(tripId);
      }
    }
  });
});
