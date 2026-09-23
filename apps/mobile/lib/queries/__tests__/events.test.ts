import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { placeholderPhoto } from "@/lib/mapping";
import { eventKeys, eventsOptions } from "@/lib/queries/events";
import type { Event } from "@journiful/shared/types";
import type { GetEventsResponse } from "@/lib/queries/events";

const mockedApiFetch = vi.mocked(apiFetch);

function row(overrides: Record<string, unknown> = {}): Event {
  return {
    id: "event-1",
    tripId: "trip-1",
    createdBy: "user-1",
    name: "Dinner at the harbour",
    description: "Book the terrace.",
    eventType: "food_and_drink",
    location: "Konoba",
    locationLat: null,
    locationLon: null,
    startTime: new Date("2026-06-05T19:30:00.000Z"),
    endTime: new Date("2026-06-05T21:00:00.000Z"),
    allDay: false,
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as Event;
}

describe("eventsOptions", () => {
  it("maps GET /trips/:tripId/events into ItineraryEvent", async () => {
    const body = {
      success: true,
      events: [
        row({
          id: "event-1",
          name: "Dinner at the harbour",
          eventType: "food_and_drink",
          location: "Konoba",
        }),
      ],
    } as unknown as GetEventsResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = eventsOptions("trip-1");
    expect(options.queryKey).toEqual(eventKeys.list("trip-1"));

    const events = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/events");
    expect(events).toHaveLength(1);
    // eventType→type, location→place, image→placeholder stub.
    expect(events[0]).toMatchObject({
      id: "event-1",
      name: "Dinner at the harbour",
      type: "food_and_drink",
      place: "Konoba",
      image: placeholderPhoto("event-1"),
    });
  });

  it("maps a null location to an empty place", async () => {
    const body = {
      success: true,
      events: [row({ id: "event-2", location: null })],
    } as unknown as GetEventsResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = eventsOptions("trip-1");
    const events = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(events[0]).toMatchObject({ id: "event-2", place: "" });
  });

  it("leaves includeDeleted off (no UI for it yet)", async () => {
    const body = { success: true, events: [] } as GetEventsResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = eventsOptions("trip-1");
    await options.queryFn!({ queryKey: options.queryKey } as never);

    const url = mockedApiFetch.mock.calls[0]?.[0] as string;
    expect(url).toBe("/trips/trip-1/events");
    expect(url).not.toContain("includeDeleted");
  });

  it("preserves server order (sorting stays with the itinerary helpers)", async () => {
    const body = {
      success: true,
      events: [
        row({ id: "event-late", startTime: new Date("2026-06-06T10:00:00.000Z") }),
        row({ id: "event-early", startTime: new Date("2026-06-05T08:00:00.000Z") }),
      ],
    } as unknown as GetEventsResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = eventsOptions("trip-1");
    const events = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(events.map((event) => event.id)).toEqual([
      "event-late",
      "event-early",
    ]);
  });
});
