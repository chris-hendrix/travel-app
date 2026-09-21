import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { tripKeys, tripsListOptions } from "@/lib/queries/trips";
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
