import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `__tests__/auth-restore.test.ts`: `react-dom`
// ships no server types in this workspace, so the renderer is loaded
// through `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { tripKeys, tripsListOptions } from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";
import { useTrips, TripsProvider } from "@/lib/tripsStore";
import type { GetTripsResponse } from "@journiful/shared/types";

const mockedApiFetch = vi.mocked(apiFetch);

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip-1",
    name: "Croatia",
    destination: "Split",
    startDate: "2026-06-04",
    endDate: "2026-06-09",
    coverImageUrl: null,
    themeId: null,
    themeFont: null,
    isOrganizer: true,
    rsvpStatus: "going",
    organizerInfo: [],
    memberCount: 4,
    eventCount: 0,
    ...overrides,
  };
}

describe("tripsListOptions", () => {
  it("calls apiFetch(\"/trips\") once and returns mapped trips", async () => {
    const body = {
      success: true,
      data: [summary()],
      meta: { nextCursor: null },
    } as unknown as GetTripsResponse;
    mockedApiFetch.mockResolvedValue(body);

    const options = tripsListOptions();
    expect(options.queryKey).toEqual(tripKeys.list());

    const trips = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips");
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      id: "trip-1",
      title: "Croatia",
      location: "Split",
      going: 4,
    });
  });
});

describe("useTrips", () => {
  it("exposes the same {trips} shape from the list query", async () => {
    mockedApiFetch.mockReset();
    const body = {
      success: true,
      data: [summary()],
      meta: { nextCursor: null },
    } as unknown as GetTripsResponse;
    mockedApiFetch.mockResolvedValue(body);

    // Prefetch into a fresh test client so the Suspense hook resolves
    // synchronously under `renderToString` (fresh data, no refetch).
    const client = makeQueryClient();
    await client.fetchQuery(tripsListOptions());

    const seen: {
      current: {
        trips: unknown;
        addTrip: unknown;
        updateTrip: unknown;
      } | null;
    } = { current: null };
    function Probe() {
      const value = useTrips();
      seen.current = {
        trips: value.trips,
        addTrip: value.addTrip,
        updateTrip: value.updateTrip,
      };
      return null;
    }
    renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          TripsProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      ),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips");
    expect(seen.current?.trips).toMatchObject([
      { id: "trip-1", title: "Croatia", location: "Split", going: 4 },
    ]);
    expect(typeof seen.current?.addTrip).toBe("function");
    expect(typeof seen.current?.updateTrip).toBe("function");
  });
});
