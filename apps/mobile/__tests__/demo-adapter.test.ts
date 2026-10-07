import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "@/lib/api";
import { buildDemoTrips } from "@/lib/demo";
import {
  createDemoStore,
  getDemoLog,
  getUnhandledApiUrls,
  installDemoFetch,
  resetDemoLog,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
import { tripsListOptions } from "@/lib/queries/trips";
import { fetchPlaceDetails } from "@/lib/queries/places";
import { lookupFlight } from "@/lib/flights";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/**
 * The demo's isolation guarantee — and what it is NOT.
 *
 * The plan's D2 (an import-graph scan proving `/demo` never reaches
 * the query layer) is dead by construction: the demo now goes through
 * the real query hooks ON PURPOSE, so an import ban is meaningless.
 * This test replaces it with the guarantee that actually holds: the
 * demo's data layer serves every request it is given and records it,
 * and the wrapped global fetch is never reached for an API URL during
 * a scripted set of demo interactions (list, detail, roster, run,
 * an event-sheet edit, a stay-sheet edit, an RSVP answer).
 *
 * That is deliberately weaker and differently-shaped than D2: it
 * proves runtime isolation (no egress), not build-time inertness. A
 * production edit that routes a demo request around the adapter would
 * still pass an import scan and fail here — which is the point.
 */
describe("the demo data layer", () => {
  const inner = vi.fn();

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000/api";
    inner.mockReset();
    inner.mockRejectedValue(new Error("network must never be reached"));
    globalThis.fetch = inner as unknown as typeof fetch;
    resetDemoLog();
    installDemoFetch(createDemoStore(buildDemoTrips(new Date("2026-10-06T12:00:00.000Z"))));
  });

  afterEach(() => {
    uninstallDemoFetch();
  });

  it("serves the scripted demo interactions with no API egress", async () => {
    const trips = await apiFetch<{ success: true; data: Array<{ id: string }> }>("/trips");
    expect(trips.data.length).toBeGreaterThanOrEqual(2);
    const tripId = trips.data[0]!.id;

    // The detail screen's reads.
    const detail = await apiFetch<{ success: true; trip: { description: string | null } }>(
      `/trips/${tripId}`,
    );
    // The fixture's invented prose reaches the real Description block.
    expect(typeof detail.trip.description).toBe("string");
    expect(detail.trip.description!.length).toBeGreaterThan(0);
    await apiFetch(`/trips/${tripId}/members`);
    const before = await apiFetch<{ success: true; events: Array<{ id: string; name: string }> }>(
      `/trips/${tripId}/events`,
    );
    await apiFetch(`/trips/${tripId}/accommodations`);
    await apiFetch(`/trips/${tripId}/member-travel`);
    expect(before.events.length).toBeGreaterThan(0);

    // An event-sheet edit submits and is visible afterwards.
    const eventId = before.events[0]!.id;
    await apiFetch(`/events/${eventId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed by the sheet" }),
    });
    const afterEvent = await apiFetch<{ success: true; events: Array<{ id: string; name: string }> }>(
      `/trips/${tripId}/events`,
    );
    expect(afterEvent.events.find((event) => event.id === eventId)?.name).toBe(
      "Renamed by the sheet",
    );

    // A stay-sheet edit submits and is visible afterwards.
    const stays = await apiFetch<{ success: true; accommodations: Array<{ id: string }> }>(
      `/trips/${tripId}/accommodations`,
    );
    const stayId = stays.accommodations[0]!.id;
    await apiFetch(`/accommodations/${stayId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Door code 4821" }),
    });
    const afterStay = await apiFetch<{
      success: true;
      accommodations: Array<{ id: string; description: string | null }>;
    }>(`/trips/${tripId}/accommodations`);
    expect(
      afterStay.accommodations.find((stay) => stay.id === stayId)?.description,
    ).toBe("Door code 4821");

    // The RSVP answers through the adapter and moves the roster row.
    await apiFetch(`/trips/${tripId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "maybe" }),
    });
    const roster = await apiFetch<{ success: true; members: Array<{ userId: string | null; status: string }> }>(
      `/trips/${tripId}/members`,
    );
    expect(roster.members.find((member) => member.userId === "demo-viewer")?.status).toBe("maybe");

    // The invented place list: typing shows selectable rows, and every
    // row resolves through details — flight lookup still reads as
    // "no such flight" through the caller's own 404 handling.
    const suggestions = await apiFetch<
      Array<{
        placeId: string;
        shortName: string;
        displayName: string;
        displayAddress: string;
        types: string[];
      }>
    >("/locations/autocomplete?q=cabo&sessionToken=x");
    // Non-empty, with the fields the picker maps (label + second line).
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(typeof suggestion.placeId).toBe("string");
      expect(suggestion.placeId.length).toBeGreaterThan(0);
      expect(typeof suggestion.displayName).toBe("string");
      expect(suggestion.displayName.length).toBeGreaterThan(0);
      expect(typeof suggestion.displayAddress).toBe("string");
      expect(suggestion.displayAddress.length).toBeGreaterThan(0);
      expect(Array.isArray(suggestion.types)).toBe(true);
    }
    // Nothing invented here is a URL: no remote addresses, nothing a
    // reader could mistake for a real listing.
    expect(JSON.stringify(suggestions)).not.toContain("http");
    // A query that matches nothing offers nothing (the picker's own
    // typed-text row still carries the field).
    const noMatch = await apiFetch<unknown[]>(
      "/locations/autocomplete?q=zzz-no-such-place&sessionToken=x",
    );
    expect(noMatch).toEqual([]);
    // Every listed row resolves through details with finite
    // coordinates, so selecting a row fills the field the way a real
    // suggestion would.
    for (const suggestion of suggestions) {
      const details = await fetchPlaceDetails(suggestion.placeId, "x");
      expect(details.placeId).toBe(suggestion.placeId);
      expect(details.address.length).toBeGreaterThan(0);
      expect(Number.isFinite(details.lat)).toBe(true);
      expect(Number.isFinite(details.lon)).toBe(true);
    }
    // Unknown ids 404 into the picker's typed-text fallback.
    await expect(fetchPlaceDetails("demo-place-nope", "x")).rejects.toThrow();
    await expect(lookupFlight("AA100", "2026-12-01")).resolves.toBeNull();

    // The real list query works unchanged against the adapter.
    const listOptions = tripsListOptions();
    const summaries = await listOptions.queryFn!({
      queryKey: listOptions.queryKey,
    } as never);
    expect(summaries.map((trip) => trip.id)).toEqual(trips.data.map((trip) => trip.id));

    // No API URL ever reached the wrapped fetch…
    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
    // …and every served request was recorded.
    const paths = getDemoLog().map((entry) => `${entry.method} ${entry.path}`);
    for (const expected of [
      "GET /trips",
      `GET /trips/${tripId}`,
      `GET /trips/${tripId}/members`,
      `GET /trips/${tripId}/events`,
      `PUT /events/${eventId}`,
      `PUT /accommodations/${stayId}`,
      `POST /trips/${tripId}/rsvp`,
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("refuses unknown API paths locally instead of leaking them", async () => {
    await expect(apiFetch("/trips/demo-trip-cabo/members/guests", { method: "POST" })).rejects.toThrow();
    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
    expect(getDemoLog().at(-1)?.served).toBe(true);
  });
});
