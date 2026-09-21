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

// Keep the real `ApiError` (the 404 branch asserts `instanceof` via
// `toErrorCopy`) and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { tripDetailOptions, tripKeys } from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTrip } from "@/lib/tripsStore";
import type {
  GetTripResponse,
  TripDetail,
} from "@journiful/shared/types";

const mockedApiFetch = vi.mocked(apiFetch);

function detail(overrides: Record<string, unknown> = {}): TripDetail {
  return {
    id: "trip-1",
    name: "Croatia",
    destination: "Split",
    destinationLat: null,
    destinationLon: null,
    startDate: "2026-06-04",
    endDate: "2026-06-09",
    preferredTimezone: "Europe/Zagreb",
    description: "Sailing week",
    coverImageUrl: null,
    createdBy: "user-1",
    allowMembersToAddEvents: true,
    showAllMembers: true,
    themeId: null,
    themeFont: null,
    cancelled: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    organizers: [],
    memberCount: 4,
    ...overrides,
  } as TripDetail;
}

describe("tripDetailOptions", () => {
  it("maps GET /trips/:id to the mobile Trip", async () => {
    const body = { success: true, trip: detail() } as GetTripResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = tripDetailOptions("trip-1");
    expect(options.queryKey).toEqual(tripKeys.detail("trip-1"));

    const trip = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1");
    expect(trip).toMatchObject({
      id: "trip-1",
      title: "Croatia",
      location: "Split",
      going: 4,
      startDate: "2026-06-04",
      endDate: "2026-06-09",
      description: "Sailing week",
      preferredTimezone: "Europe/Zagreb",
    });
    // No cover on the server: the deterministic placeholder, never a
    // broken box.
    expect(trip.image).toContain("picsum.photos/seed/trip-1");
  });

  it("a 404 yields the not-found branch (passed through, no message)", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(404, "Not found"));

    const options = tripDetailOptions("gone");
    let failed: unknown = null;
    try {
      await options.queryFn!({ queryKey: options.queryKey } as never);
    } catch (error: unknown) {
      failed = error;
    }

    expect(failed).toMatchObject({ status: 404 });
    // `message: null` is the branch signal: screens render the
    // existing "Nothing here" state instead of an error block.
    expect(toErrorCopy(failed)).toEqual({
      message: null,
      retry: false,
      offline: false,
    });
  });
});

describe("event/stay route params", () => {
  it("the event route's id param resolves the trip the event belongs to", async () => {
    mockedApiFetch.mockReset();
    const body = { success: true, trip: detail() } as GetTripResponse;
    mockedApiFetch.mockResolvedValue(body);

    // The event detail route carries `?id=<tripId>&event=<eventId>`:
    // the trip read is driven by `id` alone, the event param rides
    // along for the (still mock-backed) event lookup in Phase 6.
    const params = { id: "trip-1", event: "trip-1-2026-06-04-0" };
    const client = makeQueryClient();
    await client.fetchQuery(tripDetailOptions(params.id));

    const seen: { current: { trip: unknown } | null } = {
      current: null,
    };
    function Probe() {
      const value = useTrip(params.id);
      seen.current = { trip: value.trip };
      return null;
    }
    renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Suspense, { fallback: null }, createElement(Probe)),
      ),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1");
    expect(seen.current?.trip).toMatchObject({
      id: "trip-1",
      title: "Croatia",
    });
  });

  it("the stay route's id param resolves the trip the stay belongs to", async () => {
    mockedApiFetch.mockReset();
    const body = { success: true, trip: detail() } as GetTripResponse;
    mockedApiFetch.mockResolvedValue(body);

    // Same shape as the event route: `?id=<tripId>&stay=<stayId>`.
    const params = { id: "trip-1", stay: "trip-1-stay-1" };
    const client = makeQueryClient();
    await client.fetchQuery(tripDetailOptions(params.id));

    const seen: { current: { trip: unknown } | null } = {
      current: null,
    };
    function Probe() {
      const value = useTrip(params.id);
      seen.current = { trip: value.trip };
      return null;
    }
    renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Suspense, { fallback: null }, createElement(Probe)),
      ),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1");
    expect(seen.current?.trip).toMatchObject({
      id: "trip-1",
      title: "Croatia",
    });
  });
});

describe("useTrip", () => {
  it("exposes the same {trip} shape from the detail query", async () => {
    mockedApiFetch.mockReset();
    const body = { success: true, trip: detail() } as GetTripResponse;
    mockedApiFetch.mockResolvedValue(body);

    // Prefetch into a fresh test client so the Suspense hook resolves
    // synchronously under `renderToString` (fresh data, no refetch).
    const client = makeQueryClient();
    await client.fetchQuery(tripDetailOptions("trip-1"));

    const seen: { current: { trip: unknown } | null } = {
      current: null,
    };
    function Probe() {
      const value = useTrip("trip-1");
      seen.current = { trip: value.trip };
      return null;
    }
    renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Suspense, { fallback: null }, createElement(Probe)),
      ),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1");
    expect(seen.current?.trip).toMatchObject({
      id: "trip-1",
      title: "Croatia",
      location: "Split",
      going: 4,
    });
  });
});
