import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `trip-update.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the rollback tests assert `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { placeholderPhoto } from "@/lib/mapping";
import type { ItineraryEvent } from "@/lib/itinerary";
import type { Event } from "@journiful/shared/types";
import {
  createEvent,
  createEventOptions,
  deleteEvent,
  deleteEventOptions,
  eventKeys,
  updateEvent,
  updateEventOptions,
} from "@/lib/queries/events";
import { makeQueryClient } from "@/lib/queries/client";
import { EventsProvider, useEvents } from "@/lib/eventsStore";

const mockedApiFetch = vi.mocked(apiFetch);

/** The full event entity `POST`/`PUT` return (`eventResponseSchema`). */
function entity(overrides: Record<string, unknown> = {}): Event {
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
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as Event;
}

function cachedEvent(overrides: Partial<ItineraryEvent> = {}): ItineraryEvent {
  return {
    id: "event-1",
    name: "Dinner at the harbour",
    type: "food_and_drink",
    description: "Book the terrace.",
    startTime: "2026-06-05T19:30:00.000Z",
    endTime: "2026-06-05T21:00:00.000Z",
    allDay: false,
    place: "Konoba",
    image: placeholderPhoto("event-1"),
    deletedAt: null,
    ...overrides,
  };
}

const createInput = {
  name: "Dinner at the harbour",
  description: "Book the terrace.",
  eventType: "food_and_drink" as const,
  location: "Konoba",
  startTime: "2026-06-05T19:30:00.000Z",
  endTime: "2026-06-05T21:00:00.000Z",
  allDay: false,
};

describe("createEvent", () => {
  it("POSTs /trips/:tripId/events and returns the mapped event", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, event: entity() });

    const options = createEventOptions();
    expect(options.mutationKey).toEqual(["events", "create"]);

    const event = await createEvent("trip-1", createInput);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createInput),
    });
    // Mapped through `toEvent`: eventType→type, location→place,
    // image→placeholder. The response carries the full entity, so no
    // placeholder merge is needed (unlike the trips writes).
    expect(event).toMatchObject({
      id: "event-1",
      name: "Dinner at the harbour",
      type: "food_and_drink",
      place: "Konoba",
      image: placeholderPhoto("event-1"),
    });
  });
});

describe("updateEvent", () => {
  it("PUTs /events/:id with the partial patch and returns the mapped event", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      event: entity({ name: "Late dinner at the harbour" }),
    });

    const options = updateEventOptions();
    expect(options.mutationKey).toEqual(["events", "update"]);

    const patch = { name: "Late dinner at the harbour" };
    const event = await updateEvent("event-1", patch);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/events/event-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    expect(event).toMatchObject({
      id: "event-1",
      name: "Late dinner at the harbour",
    });
  });
});

describe("deleteEvent", () => {
  it("DELETEs /events/:id (soft server-side) and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const options = deleteEventOptions();
    expect(options.mutationKey).toEqual(["events", "delete"]);

    await expect(deleteEvent("event-1")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/events/event-1", {
      method: "DELETE",
    });
  });
});

describe("useEvents() writes", () => {
  function captureEvents() {
    const client = makeQueryClient();
    client.setQueryData<ItineraryEvent[]>(eventKeys.list("trip-1"), [
      cachedEvent(),
    ]);

    const seen: {
      actions: ReturnType<typeof useEvents> | null;
    } = { actions: null };
    function Probe() {
      seen.actions = useEvents();
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          EventsProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.actions) throw new Error("useEvents was not captured");
    return { client, actions: seen.actions };
  }

  it("addEvent paints the optimistic row and swaps in the server event", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      event: entity({ id: "event-9", name: "Harbour lunch" }),
    });

    const { client, actions } = captureEvents();

    const optimistic: ItineraryEvent = {
      ...cachedEvent(),
      id: "custom-1",
      name: "Harbour lunch",
    };
    const event = await actions.addEvent("trip-1", optimistic);
    expect(event).toMatchObject({ id: "event-9", name: "Harbour lunch" });

    // The optimistic row is gone, replaced by the server event.
    const rows = client.getQueryData<ItineraryEvent[]>(
      eventKeys.list("trip-1"),
    );
    expect(rows?.map((row) => row.id)).toEqual(["event-1", "event-9"]);
    expect(rows?.find((row) => row.id === "event-9")).toMatchObject({
      name: "Harbour lunch",
      type: "food_and_drink",
    });

    // The list invalidates, so the next mount reads server truth.
    expect(
      client.getQueryState(eventKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("addEvent rolls the optimistic row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to create event"));

    const { client, actions } = captureEvents();

    // The section exposes the failure: the action rejects, so the
    // screen can feed its InlineError instead of dismissing.
    await expect(
      actions.addEvent("trip-1", { ...cachedEvent(), id: "custom-2" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<ItineraryEvent[]>(eventKeys.list("trip-1"))).toEqual([
      cachedEvent(),
    ]);
  });

  it("updateEvent paints the patch and rolls back on failure", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      event: entity({ name: "Late dinner" }),
    });

    const { client, actions } = captureEvents();

    const event = await actions.updateEvent("trip-1", "event-1", {
      name: "Late dinner",
    });
    expect(event.name).toBe("Late dinner");
    expect(
      client.getQueryData<ItineraryEvent[]>(eventKeys.list("trip-1"))?.[0],
    ).toMatchObject({ id: "event-1", name: "Late dinner" });
    expect(
      client.getQueryState(eventKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(500, "Failed to update event"),
    );
    await expect(
      actions.updateEvent("trip-1", "event-1", { name: "Never lands" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client.getQueryData<ItineraryEvent[]>(eventKeys.list("trip-1"))?.[0],
    ).toMatchObject({ name: "Late dinner" });
  });

  it("deleteEvent marks the row deleted optimistically and invalidates", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureEvents();

    await actions.deleteEvent("trip-1", "event-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/events/event-1", {
      method: "DELETE",
    });
    // Soft server-side with includeDeleted off: the row disappears on
    // refetch, which the invalidation triggers.
    expect(
      client.getQueryState(eventKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("deleteEvent rolls the row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to delete event"));

    const { client, actions } = captureEvents();

    await expect(actions.deleteEvent("trip-1", "event-1")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(client.getQueryData<ItineraryEvent[]>(eventKeys.list("trip-1"))).toEqual([
      cachedEvent(),
    ]);
  });

  it("addEvent sends the picker's coordinates on create", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      event: entity({ locationLat: 41.3, locationLon: 2.1 }),
    });

    const { actions } = captureEvents();

    await actions.addEvent("trip-1", {
      ...cachedEvent(),
      id: "custom-3",
      locationLat: 41.3,
      locationLon: 2.1,
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockedApiFetch.mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({ locationLat: 41.3, locationLon: 2.1 });
  });

  it("a failed update keeps a concurrent write's paint", async () => {
    const { client, actions } = captureEvents();
    client.setQueryData<ItineraryEvent[]>(eventKeys.list("trip-1"), [
      cachedEvent(),
      cachedEvent({ id: "event-2", name: "Second" }),
    ]);

    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(500, "Failed to update event"),
    );
    // The second write never lands during the test: it paints and
    // stays in flight, which is exactly the interleaving that used
    // to be erased by a whole-snapshot rollback.
    mockedApiFetch.mockImplementationOnce(() => new Promise(() => {}));

    const failing = actions.updateEvent("trip-1", "event-1", {
      name: "Never lands",
    });
    void actions.updateEvent("trip-1", "event-2", {
      name: "Painted later",
    });
    await expect(failing).rejects.toBeInstanceOf(ApiError);

    const rows = client.getQueryData<ItineraryEvent[]>(
      eventKeys.list("trip-1"),
    );
    expect(rows?.find((row) => row.id === "event-1")).toMatchObject({
      name: "Dinner at the harbour",
    });
    expect(rows?.find((row) => row.id === "event-2")).toMatchObject({
      name: "Painted later",
    });
  });
});
