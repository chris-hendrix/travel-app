import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  DEMO_TRIP_BACHELOR_ID,
  DEMO_TRIP_ID,
  DEMO_TRIP_WEDDING_ID,
  buildDemoTrips,
} from "@/lib/demo";
import {
  DEMO_PLACES,
  buildDemoStore,
  getDemoLog,
  getUnhandledApiUrls,
  installDemoFetch,
  resetDemoLog,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
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
 * a scripted set of demo interactions (invite preview, detail, roster,
 * run, an event-sheet edit, a stay-sheet edit, an RSVP answer).
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
    installDemoFetch(buildDemoStore(new Date("2026-10-06T12:00:00.000Z")));
  });

  afterEach(() => {
    uninstallDemoFetch();
  });

  it("serves the scripted demo interactions with no API egress", async () => {
    // The invitation preview is gone with the fake phone that was its
    // only consumer: any id 404s into the invite screen's own gone
    // state, exactly like a real unknown id.
    await expect(apiFetch("/invitations/anything/preview")).rejects.toThrow();

    const tripId = DEMO_TRIP_ID;

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

    // No API URL ever reached the wrapped fetch…
    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
    // …and every served request was recorded.
    const paths = getDemoLog().map((entry) => `${entry.method} ${entry.path}`);
    for (const expected of [
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

  it("keeps an id-addressed write on its own trip", async () => {
    // D2's regression guard: `PUT /events/:id`, `PUT /accommodations/:id`
    // and `DELETE /member-travel/:id` resolve by id ALONE through
    // `findRowAnywhere`, which takes the first trip's match. Shared row
    // ids across the three fixtures would therefore edit the wrong
    // trip — and the RSVP path is trip-scoped, so it would not catch it.
    const caboEvents = await apiFetch<{
      success: true;
      events: Array<{ id: string; name: string }>;
    }>(`/trips/${DEMO_TRIP_ID}/events`);
    const bachelorEvents = await apiFetch<{
      success: true;
      events: Array<{ id: string; name: string }>;
    }>(`/trips/${DEMO_TRIP_BACHELOR_ID}/events`);
    const bachelorEvent = bachelorEvents.events[0]!;
    expect(caboEvents.events.map((event) => event.id)).not.toContain(
      bachelorEvent.id,
    );

    await apiFetch(`/events/${bachelorEvent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed in San Diego" }),
    });

    // The beach trip is byte-identical; the bachelor party carries the edit.
    const caboAfter = await apiFetch<{ success: true; events: unknown[] }>(
      `/trips/${DEMO_TRIP_ID}/events`,
    );
    expect(caboAfter.events).toEqual(caboEvents.events);
    const bachelorAfter = await apiFetch<{
      success: true;
      events: Array<{ id: string; name: string }>;
    }>(`/trips/${DEMO_TRIP_BACHELOR_ID}/events`);
    expect(
      bachelorAfter.events.find((event) => event.id === bachelorEvent.id)?.name,
    ).toBe("Renamed in San Diego");

    // The same shape for an id-addressed delete on the travel board.
    const caboTravel = await apiFetch<{
      success: true;
      memberTravels: Array<{ id: string }>;
    }>(`/trips/${DEMO_TRIP_ID}/member-travel`);
    const bachelorTravel = await apiFetch<{
      success: true;
      memberTravels: Array<{ id: string }>;
    }>(`/trips/${DEMO_TRIP_BACHELOR_ID}/member-travel`);
    const travelId = bachelorTravel.memberTravels[0]!.id;
    await apiFetch(`/member-travel/${travelId}`, { method: "DELETE" });
    const caboTravelAfter = await apiFetch<{ success: true; memberTravels: unknown[] }>(
      `/trips/${DEMO_TRIP_ID}/member-travel`,
    );
    expect(caboTravelAfter.memberTravels).toEqual(caboTravel.memberTravels);

    // And the trip-scoped RSVP moves only that trip's viewer row.
    await apiFetch(`/trips/${DEMO_TRIP_WEDDING_ID}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "not_going" }),
    });
    const caboRoster = await apiFetch<{
      success: true;
      members: Array<{ userId: string | null; status: string }>;
    }>(`/trips/${DEMO_TRIP_ID}/members`);
    expect(
      caboRoster.members.find((row) => row.userId === "demo-viewer")?.status,
    ).toBe("going");
  });

  it("refuses unknown API paths locally instead of leaking them", async () => {
    await expect(apiFetch("/trips/demo-trip-cabo/members/guests", { method: "POST" })).rejects.toThrow();
    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
    expect(getDemoLog().at(-1)?.served).toBe(true);
  });

  it("names real places, in each trip's own city and country, and no city without a trip", async () => {
    const trips = buildDemoTrips(new Date("2026-10-06T12:00:00.000Z"));
    const cities = trips.map((trip) => trip.location.split(",")[0]!.trim());

    // At least two rows per destination, so every picker has something to
    // offer — and every one of them a place the itinerary itself visits.
    for (const city of cities) {
      const rows = DEMO_PLACES.filter((place) =>
        place.displayAddress.includes(city),
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
    }

    // Every row names a city one of the three fixtures is in, and carries
    // that trip's own country, so the picker's floor can never offer a San
    // Diego venue for the wedding. The rows are real places now, which no
    // test can assert; the machine-checkable half is that nothing here is
    // a URL — a photo of a named business may not be stored at all, so a
    // URL in this list would be the one that broke the rule — and that no
    // id is reused.
    for (const place of DEMO_PLACES) {
      expect(
        cities.some((city) => place.displayAddress.includes(city)),
      ).toBe(true);
      const owner = trips.find((trip) =>
        place.displayAddress.includes(trip.location.split(",")[0]!.trim()),
      );
      expect(place.country).toBe(owner!.placeCountry);
    }
    expect(JSON.stringify(DEMO_PLACES)).not.toContain("http");
    expect(new Set(DEMO_PLACES.map((place) => place.placeId)).size).toBe(
      DEMO_PLACES.length,
    );
  });

  it("carries each trip's country, and scopes the picker's list to it", async () => {
    // The picker's floor comes off the trip (`countryForTrip` reads
    // `trip.placeCountry`), so the detail row has to carry it.
    for (const [tripId, country] of [
      [DEMO_TRIP_ID, "MX"],
      [DEMO_TRIP_WEDDING_ID, "MX"],
      [DEMO_TRIP_BACHELOR_ID, "US"],
    ] as const) {
      const detail = await apiFetch<{
        success: true;
        trip: { place: { country: string | null } | null };
      }>(`/trips/${tripId}`);
      expect(detail.trip.place?.country).toBe(country);
    }

    type Row = { placeId: string; displayAddress: string };
    const mexico = await apiFetch<Row[]>(
      "/locations/autocomplete?q=&sessionToken=x&country=MX",
    );
    expect(mexico.length).toBeGreaterThanOrEqual(3);
    for (const row of mexico) expect(row.displayAddress).toContain("Mexico");

    const usa = await apiFetch<Row[]>(
      "/locations/autocomplete?q=&sessionToken=x&country=US",
    );
    expect(usa.length).toBeGreaterThanOrEqual(2);
    for (const row of usa) expect(row.displayAddress).toContain("USA");

    // No country (the destination picker, which is itself choosing the
    // country): the whole list, both destinations included.
    const all = await apiFetch<Row[]>(
      "/locations/autocomplete?q=&sessionToken=x",
    );
    expect(all.length).toBe(mexico.length + usa.length);
  });
});
