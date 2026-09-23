import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `__tests__/trips.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the rollback test asserts `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { Trip } from "@/components/trip/TripCard";
import {
  createTrip,
  createTripOptions,
  tripKeys,
  type CreateTripRequest,
} from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";
import { TripsProvider, useTripsActions } from "@/lib/tripsStore";

const mockedApiFetch = vi.mocked(apiFetch);

/** The base trip entity `POST /trips` returns (no `memberCount` yet). */
function createdTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip-9",
    name: "Dolomites",
    destination: "Bolzano",
    destinationLat: null,
    destinationLon: null,
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    preferredTimezone: "Europe/Rome",
    description: null,
    coverImageUrl: null,
    createdBy: "user-1",
    allowMembersToAddEvents: false,
    showAllMembers: false,
    themeId: null,
    themeFont: null,
    cancelled: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function existingTrip(): Trip {
  return {
    id: "trip-1",
    title: "Croatia",
    location: "Split",
    image: "https://picsum.photos/seed/trip-1/900/450",
    going: 4,
    startDate: "2026-06-04",
    endDate: "2026-06-09",
    description: null,
    preferredTimezone: "",
  };
}

const input = {
  name: "Dolomites",
  destination: "Bolzano",
  timezone: "Europe/Rome",
  startDate: "2026-07-01",
  endDate: "2026-07-05",
};

describe("createTrip", () => {
  it("POSTs /trips with the shared createTripSchema fields and returns the mapped trip", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, trip: createdTrip() });

    const options = createTripOptions();
    expect(options.mutationKey).toEqual(["trips", "create"]);

    const trip = await createTrip(input);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    // Mapped through `toTrip`: the creator is the sole member, so the
    // entity's missing `memberCount` reads as one.
    expect(trip).toMatchObject({
      id: "trip-9",
      title: "Dolomites",
      location: "Bolzano",
      going: 1,
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
  });
});

describe("useTripsActions().addTrip", () => {
  function captureAddTrip() {
    const client = makeQueryClient();
    client.setQueryData<Trip[]>(tripKeys.list(), [existingTrip()]);

    const seen: {
      addTrip: ((input: CreateTripRequest) => Promise<Trip>) | null;
    } = { addTrip: null };
    function Probe() {
      const actions = useTripsActions();
      seen.addTrip = actions.addTrip;
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          TripsProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.addTrip) throw new Error("addTrip was not captured");
    return { client, addTrip: seen.addTrip };
  }

  it("optimistically prepends the new trip, then swaps in the server trip", async () => {
    mockedApiFetch.mockReset();
    // The POST hangs until the test releases it, so the optimistic
    // prepend (`onMutate`, after `cancelQueries`) is observable before
    // the server answers.
    let resolvePost!: (value: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const { client, addTrip } = captureAddTrip();

    const pending = addTrip(input);

    await vi.waitFor(() =>
      expect(client.getQueryData<Trip[]>(tripKeys.list())).toHaveLength(2),
    );
    expect(client.getQueryData<Trip[]>(tripKeys.list())?.[0]).toMatchObject({
      title: "Dolomites",
      location: "Bolzano",
      going: 1,
    });

    resolvePost({ success: true, trip: createdTrip() });
    const trip = await pending;
    expect(trip.id).toBe("trip-9");

    // The server trip replaces the optimistic placeholder, in place.
    const settled = client.getQueryData<Trip[]>(tripKeys.list());
    expect(settled).toHaveLength(2);
    expect(settled?.[0]).toMatchObject({ id: "trip-9", title: "Dolomites" });
    expect(settled?.[1]).toMatchObject({ id: "trip-1" });

    // And the list is invalidated, so the next mount reads server truth.
    expect(client.getQueryState(tripKeys.list())?.isInvalidated).toBe(true);
  });

  it("rolls back the prepend when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to create trip"),
    );

    const { client, addTrip } = captureAddTrip();

    await expect(addTrip(input)).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<Trip[]>(tripKeys.list())).toEqual([
      existingTrip(),
    ]);
  });
});
