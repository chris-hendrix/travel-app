import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `trip-cover.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`). This package's vitest is plain node,
// with no renderer.
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the failure test asserts `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { Trip } from "@/components/trip/TripCard";
import { cancelTrip, cancelTripOptions, tripKeys } from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";
import { TripsProvider, useTripsActions } from "@/lib/tripsStore";

const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  mockedApiFetch.mockReset();
});

function cachedTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    title: "Dolomites",
    location: "Bolzano",
    image: null,
    coverImageUrl: null,
    going: 4,
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    description: null,
    preferredTimezone: "Europe/Rome",
    ...overrides,
  };
}

describe("cancelTrip", () => {
  it("DELETEs /trips/:id and resolves", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    const options = cancelTripOptions();
    expect(options.mutationKey).toEqual(["trips", "cancel"]);

    await expect(cancelTrip("trip-1")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1", {
      method: "DELETE",
    });
  });
});

describe("useTripsActions().deleteTrip", () => {
  /**
   * Renders `useTripsActions` against a fresh client seeded with both
   * caches and hands back the captured `deleteTrip`, so the cache
   * assertions below read the same cache the mutation wrote.
   */
  function captureDeleteTrip() {
    const client = makeQueryClient();
    client.setQueryData<Trip[]>(tripKeys.list(), [cachedTrip()]);
    client.setQueryData<Trip>(tripKeys.detail("trip-1"), cachedTrip());

    const seen: { deleteTrip: ((id: string) => Promise<unknown>) | null } = {
      deleteTrip: null,
    };
    function Probe() {
      const actions = useTripsActions();
      seen.deleteTrip = actions.deleteTrip;
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
    if (!seen.deleteTrip) throw new Error("deleteTrip was not captured");
    return { client, deleteTrip: seen.deleteTrip };
  }

  it("drops the row from the list and removes the detail entry on success", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, deleteTrip } = captureDeleteTrip();

    await deleteTrip("trip-1");

    expect(client.getQueryData<Trip[]>(tripKeys.list())).toEqual([]);
    expect(client.getQueryData(tripKeys.detail("trip-1"))).toBeUndefined();
    expect(client.getQueryState(tripKeys.detail("trip-1"))).toBeUndefined();
  });

  it("rejects on failure, calls the API exactly once, and paints nothing", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Delete failed"));

    const { client, deleteTrip } = captureDeleteTrip();

    await expect(deleteTrip("trip-1")).rejects.toBeInstanceOf(ApiError);
    // The second half of the assertion: without it, `rejects` would
    // also pass on an action that did nothing at all.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    // No optimistic paint, so a failure leaves the list exactly as it
    // was — the difference between this write and every other one in
    // the store.
    expect(client.getQueryData<Trip[]>(tripKeys.list())).toEqual([cachedTrip()]);
    expect(client.getQueryData<Trip>(tripKeys.detail("trip-1"))).toEqual(
      cachedTrip(),
    );
  });

  it("invalidates the list query once the write settles", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, deleteTrip } = captureDeleteTrip();

    await deleteTrip("trip-1");

    expect(client.getQueryState(tripKeys.list())?.isInvalidated).toBe(true);
  });
});
