import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same pattern as `stays.test.ts` / `event-writes.test.ts`: stub the
// network at the module boundary, keep the real `ApiError` (rollback
// tests assert `instanceof`).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

// Same probe seam as `stays.test.ts`: `react-dom` ships no server
// types in this workspace, so the renderer is loaded through `require`
// (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { MockTravel } from "@/mocks/travel";
import { travelBoard } from "@/lib/travelBoard";
import { legFromLookup, emptyLeg } from "@/lib/newTravel";
import type {
  FlightLookupResponse,
  MemberTravel,
} from "@journiful/shared/types";
import { isFlightNumber, lookupFlight } from "@/lib/flights";
import {
  createTravel,
  createTravelOptions,
  deleteTravel,
  deleteTravelOptions,
  travelKeys,
  travelOptions,
  updateTravel,
  updateTravelOptions,
  type GetTravelResponse,
} from "@/lib/queries/travel";
import { makeQueryClient } from "@/lib/queries/client";
import {
  TravelProvider,
  useTravel as useTravelStore,
} from "@/lib/travelStore";

const mockedApiFetch = vi.mocked(apiFetch);

/**
 * The full member-travel entity the list/create/update endpoints
 * return (`memberTravelResponseSchema` /
 * `memberTravelListResponseSchema` in `shared/schemas/member-travel.ts`).
 * Times are ISO strings on the wire (Fastify serializes the `z.date()`
 * columns); `memberName` arrives on the list join only, so create/update
 * rows carry none and the mapping falls back to "".
 */
function row(overrides: Record<string, unknown> = {}): MemberTravel {
  return {
    id: "travel-1",
    tripId: "trip-1",
    memberId: "member-1",
    memberName: "Ana",
    travelType: "arrival",
    departureLocation: "JFK T4",
    departureTime: "2026-06-04T11:00:00.000Z",
    arrivalLocation: "BCN T2",
    arrivalTime: "2026-06-04T19:40:00.000Z",
    flightNumber: "UA 1842",
    details: "Landing T2, bags take twenty minutes.",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    // Times are ISO strings on the wire (Fastify serializes the
    // `z.date()` columns); `toTravel` accepts `Date | string`.
  } as unknown as MemberTravel;
}

function cachedTravel(overrides: Partial<MockTravel> = {}): MockTravel {
  return {
    id: "travel-1",
    memberId: "member-1",
    memberName: "Ana",
    travelType: "arrival",
    departureTime: "2026-06-04T11:00:00.000Z",
    departureLocation: "JFK T4",
    arrivalTime: "2026-06-04T19:40:00.000Z",
    arrivalLocation: "BCN T2",
    flightNumber: "UA 1842",
    details: "Landing T2, bags take twenty minutes.",
    deletedAt: null,
    ...overrides,
  };
}

describe("travelOptions", () => {
  it("maps GET /trips/:tripId/member-travel into MockTravel rows", async () => {
    const body = { success: true, memberTravels: [row()] } as unknown as {
      success: true;
      memberTravels: MemberTravel[];
    };
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = travelOptions("trip-1");
    expect(options.queryKey).toEqual(travelKeys.list("trip-1"));

    const travel = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/member-travel",
    );
    expect(travel).toHaveLength(1);
    // Both ends map through, with the member name off the list join.
    expect(travel[0]).toMatchObject({
      id: "travel-1",
      memberId: "member-1",
      memberName: "Ana",
      travelType: "arrival",
      departureTime: "2026-06-04T11:00:00.000Z",
      departureLocation: "JFK T4",
      arrivalTime: "2026-06-04T19:40:00.000Z",
      arrivalLocation: "BCN T2",
      flightNumber: "UA 1842",
    });
  });

  it("maps a null-times row as the unshared record", async () => {
    const body = {
      success: true,
      memberTravels: [
        row({
          id: "travel-2",
          travelType: "departure",
          departureTime: null,
          departureLocation: null,
          arrivalTime: null,
          arrivalLocation: null,
          flightNumber: null,
          details: null,
        }),
      ],
    } as unknown as GetTravelResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = travelOptions("trip-1");
    const travel = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(travel[0]).toMatchObject({
      id: "travel-2",
      travelType: "departure",
      departureTime: null,
      arrivalTime: null,
    });
    // And the board files it unscheduled: null pertinent time means the
    // foot of the section, never among the timed rows.
    const board = travelBoard(travel, null, []);
    const scheduled = [...board.arrivals, ...board.departures].filter(
      (scheduledRow) => scheduledRow.time !== null,
    );
    expect(scheduled).toHaveLength(0);
  });

  it("maps the departure direction off its own end", async () => {
    const body = {
      success: true,
      memberTravels: [
        row({
          id: "travel-3",
          memberId: "member-2",
          memberName: "Bo",
          travelType: "departure",
          departureTime: "2026-06-09T07:05:00.000Z",
          departureLocation: "BCN T2",
          arrivalTime: "2026-06-09T09:40:00.000Z",
          arrivalLocation: "JFK T4",
        }),
      ],
    } as unknown as GetTravelResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = travelOptions("trip-1");
    const travel = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(travel[0]).toMatchObject({
      travelType: "departure",
      departureLocation: "BCN T2",
      arrivalLocation: "JFK T4",
    });
  });

  it("leaves includeDeleted off (no UI for it yet)", async () => {
    const body = { success: true, memberTravels: [] } as GetTravelResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = travelOptions("trip-1");
    await options.queryFn!({ queryKey: options.queryKey } as never);

    const url = mockedApiFetch.mock.calls[0]?.[0] as string;
    expect(url).toBe("/trips/trip-1/member-travel");
    expect(url).not.toContain("includeDeleted");
  });

  it("preserves server order (sorting stays with travelBoard)", async () => {
    const body = {
      success: true,
      memberTravels: [
        row({ id: "travel-late", arrivalTime: "2026-06-05T10:05:00.000Z" }),
        row({ id: "travel-early", arrivalTime: "2026-06-04T19:40:00.000Z" }),
      ],
    } as unknown as GetTravelResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = travelOptions("trip-1");
    const travel = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(travel.map((record) => record.id)).toEqual([
      "travel-late",
      "travel-early",
    ]);
  });
});

describe("flight lookup (lib/flights.ts, untouched)", () => {
  const lookupBody = {
    available: true,
    flight: {
      departureAirport: { iata: "JFK", name: "New York JFK" },
      departureTime: "2026-06-04T11:00:00.000Z",
      arrivalAirport: { iata: "BCN", name: "Barcelona El Prat" },
      arrivalTime: "2026-06-04T19:40:00.000Z",
    },
  } as FlightLookupResponse;

  it("still POSTs /flights/lookup and returns the flight", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(lookupBody);

    const flight = await lookupFlight("UA1842", "2026-06-04");

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/flights/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightNumber: "UA1842", date: "2026-06-04" }),
    });
    expect(flight).toMatchObject({
      departureTime: "2026-06-04T11:00:00.000Z",
      arrivalTime: "2026-06-04T19:40:00.000Z",
    });
  });

  it("fills both ends of a travel form leg", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(lookupBody);

    const flight = await lookupFlight("UA1842", "2026-06-04");
    if (!flight) throw new Error("lookup should have found the flight");

    // The dialog's own fill: both ends land in the leg, the pertinent
    // side on the day's date, the far side carried silently.
    const leg = legFromLookup(
      { ...emptyLeg(), day: "2026-06-04" },
      "arrival",
      flight,
      "UA1842",
      null,
    );
    expect(leg.day).toBe("2026-06-04");
    expect(leg.arrivalTime).not.toBe("");
    expect(leg.departureTime).not.toBe("");
    // `applyFlightLookup` words the pertinent end as "Name (IATA)".
    expect(leg.location).toBe("Barcelona El Prat (BCN)");
    expect(leg.otherLocation).toBe("New York JFK (JFK)");
    expect(leg.flightNumber).toBe("UA1842");
  });

  it("normalizes spaced/hyphenated/lowercase input to the compact wire body", async () => {
    for (const input of ["UA 1842", "ua-1842", "ua 1842"]) {
      mockedApiFetch.mockReset();
      mockedApiFetch.mockResolvedValue(lookupBody);

      const flight = await lookupFlight(input, "2026-06-04");
      expect(flight).toMatchObject({
        departureTime: "2026-06-04T11:00:00.000Z",
      });
      expect(mockedApiFetch).toHaveBeenCalledWith("/flights/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightNumber: "UA1842", date: "2026-06-04" }),
      });
    }
  });

  it("accepts the placeholder form via isFlightNumber", () => {
    expect(isFlightNumber("UA 1842")).toBe(true);
    expect(isFlightNumber("ua-1842")).toBe(true);
    expect(isFlightNumber("")).toBe(false);
    expect(isFlightNumber("12345")).toBe(false);
  });

  it("still answers null for an unknown flight (404)", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(404, "Not found"));

    await expect(lookupFlight("UA9999", "2026-06-04")).resolves.toBeNull();
  });
});

const createInput = {
  travelType: "arrival" as const,
  memberId: "member-1",
  departureLocation: "JFK T4",
  departureTime: "2026-06-04T11:00:00.000Z",
  arrivalLocation: "BCN T2",
  arrivalTime: "2026-06-04T19:40:00.000Z",
  flightNumber: "UA 1842",
};

describe("createTravel", () => {
  it("POSTs /trips/:tripId/member-travel and returns the mapped record", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, memberTravel: row() });

    const options = createTravelOptions();
    expect(options.mutationKey).toEqual(["travel", "create"]);

    const record = await createTravel("trip-1", createInput);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/member-travel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createInput),
      },
    );
    // Mapped through `toTravel`: both ends, the member name off the
    // join. The response carries the full entity, so no placeholder
    // merge is needed (unlike the trips writes).
    expect(record).toMatchObject({
      id: "travel-1",
      memberName: "Ana",
      travelType: "arrival",
      arrivalLocation: "BCN T2",
    });
  });
});

describe("updateTravel", () => {
  it("PUTs /member-travel/:id with the partial patch and returns the mapped record", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      memberTravel: row({ details: "Now with a checked bag." }),
    });

    const options = updateTravelOptions();
    expect(options.mutationKey).toEqual(["travel", "update"]);

    // The update schema is partial
    // (`baseMemberTravelSchema.partial()`), so an edit sends only what
    // changed.
    const patch = { details: "Now with a checked bag." };
    const record = await updateTravel("travel-1", patch);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/member-travel/travel-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    expect(record).toMatchObject({
      id: "travel-1",
      details: "Now with a checked bag.",
    });
  });
});

describe("deleteTravel", () => {
  it("DELETEs /member-travel/:id (soft server-side) and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const options = deleteTravelOptions();
    expect(options.mutationKey).toEqual(["travel", "delete"]);

    await expect(deleteTravel("travel-1")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/member-travel/travel-1", {
      method: "DELETE",
    });
  });
});

describe("useTravel() writes (travelStore)", () => {
  function captureTravel() {
    const client = makeQueryClient();
    client.setQueryData<MockTravel[]>(travelKeys.list("trip-1"), [
      cachedTravel(),
    ]);

    const seen: {
      actions: ReturnType<typeof useTravelStore> | null;
    } = { actions: null };
    function Probe() {
      seen.actions = useTravelStore();
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          TravelProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.actions) throw new Error("useTravel was not captured");
    return { client, actions: seen.actions };
  }

  it("addTravel paints the optimistic row and swaps in the server record", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      memberTravel: row({ id: "travel-9", memberName: "Ana" }),
    });

    const { client, actions } = captureTravel();

    const optimistic: MockTravel = {
      ...cachedTravel(),
      id: "custom-arrival-1",
      flightNumber: null,
    };
    const record = await actions.addTravel("trip-1", optimistic);
    expect(record).toMatchObject({ id: "travel-9", memberName: "Ana" });

    // The optimistic row is gone, replaced by the server record.
    const rows = client.getQueryData<MockTravel[]>(travelKeys.list("trip-1"));
    expect(rows?.map((row) => row.id)).toEqual(["travel-1", "travel-9"]);
    expect(rows?.find((row) => row.id === "travel-9")).toMatchObject({
      travelType: "arrival",
      arrivalLocation: "BCN T2",
    });

    // The list invalidates, so the next mount reads server truth.
    expect(
      client.getQueryState(travelKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("addTravel rolls the optimistic row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to create travel"),
    );

    const { client, actions } = captureTravel();

    // The board exposes the failure: the action rejects, so the screen
    // can feed its InlineError instead of dismissing.
    await expect(
      actions.addTravel("trip-1", { ...cachedTravel(), id: "custom-2" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<MockTravel[]>(travelKeys.list("trip-1"))).toEqual(
      [cachedTravel()],
    );
  });

  it("updateTravel paints the patch and rolls back on failure", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      memberTravel: row({ details: "Now with a checked bag." }),
    });

    const { client, actions } = captureTravel();

    const record = await actions.updateTravel("trip-1", "travel-1", {
      details: "Now with a checked bag.",
    });
    expect(record.details).toBe("Now with a checked bag.");
    expect(
      client.getQueryData<MockTravel[]>(travelKeys.list("trip-1"))?.[0],
    ).toMatchObject({ id: "travel-1", details: "Now with a checked bag." });
    expect(
      client.getQueryState(travelKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(500, "Failed to update travel"),
    );
    await expect(
      actions.updateTravel("trip-1", "travel-1", { details: "Never lands" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client.getQueryData<MockTravel[]>(travelKeys.list("trip-1"))?.[0],
    ).toMatchObject({ details: "Now with a checked bag." });
  });

  it("deleteTravel marks the row deleted optimistically and invalidates", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureTravel();

    await actions.deleteTravel("trip-1", "travel-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/member-travel/travel-1", {
      method: "DELETE",
    });
    // Soft server-side with includeDeleted off: the row disappears on
    // refetch, which the invalidation triggers.
    expect(
      client.getQueryState(travelKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("deleteTravel rolls the row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to delete travel"),
    );

    const { client, actions } = captureTravel();

    await expect(
      actions.deleteTravel("trip-1", "travel-1"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<MockTravel[]>(travelKeys.list("trip-1"))).toEqual(
      [cachedTravel()],
    );
  });
});
