import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `trip-create.test.ts`: `react-dom` ships no
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
  tripKeys,
  updateTrip,
  updateTripOptions,
} from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";
import { TripsProvider, useTripsActions } from "@/lib/tripsStore";

const mockedApiFetch = vi.mocked(apiFetch);

/** The base trip entity `PUT /trips/:id` returns (no `memberCount`). */
function updatedEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip-1",
    name: "Dolomites Extended",
    destination: "Bolzano",
    destinationLat: null,
    destinationLon: null,
    startDate: "2026-07-01",
    endDate: "2026-07-08",
    preferredTimezone: "Europe/Rome",
    description: "Extra days",
    coverImageUrl: null,
    createdBy: "user-1",
    allowMembersToAddEvents: false,
    showAllMembers: false,
    themeId: null,
    themeFont: null,
    cancelled: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function cachedTrip(): Trip {
  return {
    id: "trip-1",
    title: "Dolomites",
    location: "Bolzano",
    image: "https://picsum.photos/seed/trip-1/900/450",
    going: 4,
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    description: null,
    preferredTimezone: "Europe/Rome",
  };
}

const patch = {
  name: "Dolomites Extended",
  destination: "Bolzano",
  startDate: "2026-07-01",
  endDate: "2026-07-08",
  description: "Extra days",
};

describe("updateTrip", () => {
  it("PUTs /trips/:id with the patch and returns the mapped trip", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, trip: updatedEntity() });

    const options = updateTripOptions();
    expect(options.mutationKey).toEqual(["trips", "update"]);

    const trip = await updateTrip("trip-1", patch);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    // Mapped through `toTrip`: the entity carries the edited fields.
    // `going` is a placeholder here (PUT returns the base entity with
    // no `memberCount`); the provider merge preserves the cached count.
    expect(trip).toMatchObject({
      id: "trip-1",
      title: "Dolomites Extended",
      location: "Bolzano",
      startDate: "2026-07-01",
      endDate: "2026-07-08",
      description: "Extra days",
    });
  });
});

describe("useTripsActions().updateTrip", () => {
  function captureUpdateTrip() {
    const client = makeQueryClient();
    client.setQueryData<Trip[]>(tripKeys.list(), [cachedTrip()]);
    client.setQueryData<Trip>(tripKeys.detail("trip-1"), cachedTrip());

    const seen: {
      updateTrip: ((id: string, patch: Record<string, unknown>) => Promise<Trip>) | null;
    } = { updateTrip: null };
    function Probe() {
      const actions = useTripsActions();
      seen.updateTrip = actions.updateTrip as typeof seen.updateTrip;
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
    if (!seen.updateTrip) throw new Error("updateTrip was not captured");
    return { client, updateTrip: seen.updateTrip };
  }

  it("writes the server response into the detail cache", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, trip: updatedEntity() });

    const { client, updateTrip } = captureUpdateTrip();

    const trip = await updateTrip("trip-1", patch);
    expect(trip.title).toBe("Dolomites Extended");

    // The detail cache carries the server trip, keeping the roster
    // count the PUT response cannot know.
    expect(client.getQueryData<Trip>(tripKeys.detail("trip-1"))).toMatchObject({
      id: "trip-1",
      title: "Dolomites Extended",
      endDate: "2026-07-08",
      description: "Extra days",
      going: 4,
    });
    // The list row follows the edit too.
    expect(client.getQueryData<Trip[]>(tripKeys.list())?.[0]).toMatchObject({
      id: "trip-1",
      title: "Dolomites Extended",
    });

    // Both caches invalidate, so the next mount reads server truth.
    expect(client.getQueryState(tripKeys.detail("trip-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(tripKeys.list())?.isInvalidated).toBe(true);
  });

  it("rolls back both caches when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to update trip"));

    const { client, updateTrip } = captureUpdateTrip();

    await expect(updateTrip("trip-1", patch)).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<Trip>(tripKeys.detail("trip-1"))).toEqual(cachedTrip());
    expect(client.getQueryData<Trip[]>(tripKeys.list())).toEqual([cachedTrip()]);
  });
});
