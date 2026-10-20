import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  DEMO_TRIP_BACHELOR_ID,
  DEMO_TRIP_ID,
  DEMO_TRIP_IDS,
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
import { wallClock } from "@/lib/timezone";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** One expense as the API serves it (the fields this walk reads). */
type PaymentRow = {
  id: string;
  amount: number;
  note: string | null;
  /** The rule the cost is shared by — `custom` when the rows are it. */
  splitScope: string;
  payerMemberId: string;
  payerName: string;
  date: string;
  /** A **user** id, never a member id. */
  createdBy: string;
  participants: {
    id: string;
    memberId: string;
    name: string;
    shareAmount: number;
  }[];
  deletedAt: string | null;
};

/** One simplified move, as `GET /trips/:id/balances` serves it. */
type MoveRow = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
};

/** A roster row, which is where both id spaces come from. */
type MemberRow = { id: string; userId: string | null; displayName: string };

/** One travel row as the demo serves it (the fields this walk reads). */
type TravelRow = {
  id: string;
  memberId: string;
  travelType: "arrival" | "departure";
  transportMode: string;
  departureLocation: string | null;
  arrivalLocation: string | null;
};

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

    // The ledger's three reads, which is what the Settle door opens: the
    // entries, the trip's simplified moves, and the viewer's own position.
    // All three used to fall through to the generic 404, which left the
    // sheet showing three failures — so the walk reads them like any
    // other screen read.
    const ledger = await apiFetch<{ success: true; payments: PaymentRow[] }>(
      `/trips/${tripId}/payments`,
    );
    expect(ledger.payments.length).toBeGreaterThan(0);
    const debts = await apiFetch<{ success: true; balances: MoveRow[] }>(
      `/trips/${tripId}/balances`,
    );
    // A debt row to draw, which a ledger split across one person could
    // never produce.
    expect(debts.balances.length).toBeGreaterThan(0);
    const position = await apiFetch<{
      success: true;
      netBalance: number;
      details: { person: { id: string; name: string }; amount: number }[];
    }>(`/trips/${tripId}/balances/me`);
    // The viewer owes on this fixture: the headline has a number and the
    // details name who it is owed to.
    expect(position.netBalance).toBeLessThan(0);
    expect(position.details.length).toBeGreaterThan(0);

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
      `GET /trips/${tripId}/payments`,
      `GET /trips/${tripId}/balances`,
      `GET /trips/${tripId}/balances/me`,
      `PUT /events/${eventId}`,
      `PUT /accommodations/${stayId}`,
      `POST /trips/${tripId}/rsvp`,
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("answers the Where field's cross-trip locations, from the viewer's own rows", async () => {
    const answer = await apiFetch<{ success: true; locations: string[] }>(
      "/member-travel/locations",
    );

    // The demo viewer flies into SJD on two of its trips, under two
    // different terminals — the cross-trip source the sheet's `Where`
    // field needs, as the real endpoint serves it. Answered locally, so
    // the no-egress assertion below still holds for it.
    expect(answer.locations).toContain("SJD T1");
    expect(answer.locations).toContain("SJD T2");
    // The shape the ranking relies on: trimmed, non-blank, deduped
    // case-insensitively, capped.
    for (const location of answer.locations) {
      expect(location).toBe(location.trim());
      expect(location).not.toBe("");
    }
    expect(new Set(answer.locations.map((l) => l.toLowerCase())).size).toBe(
      answer.locations.length,
    );
    expect(answer.locations.length).toBeLessThanOrEqual(20);

    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
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

  it("computes the ledger's moves from the expenses it serves", async () => {
    const tripId = DEMO_TRIP_ID;
    const roster = await apiFetch<{ success: true; members: MemberRow[] }>(
      `/trips/${tripId}/members`,
    );
    const viewer = roster.members.find((row) => row.userId === "demo-viewer");
    expect(viewer).toBeDefined();

    const { payments } = await apiFetch<{
      success: true;
      payments: PaymentRow[];
    }>(`/trips/${tripId}/payments`);
    const { balances } = await apiFetch<{
      success: true;
      balances: MoveRow[];
    }>(`/trips/${tripId}/balances`);
    const mine = await apiFetch<{
      success: true;
      netBalance: number;
      details: { person: { id: string; name: string }; amount: number }[];
    }>(`/trips/${tripId}/balances/me`);

    expect(payments.length).toBeGreaterThan(0);
    expect(balances.length).toBeGreaterThan(0);

    // Every expense names its people, and its shares add up to it — the
    // sheet draws the split straight off these rows.
    for (const payment of payments) {
      expect(payment.participants.length).toBeGreaterThan(0);
      expect(
        payment.participants.reduce(
          (sum, participant) => sum + participant.shareAmount,
          0,
        ),
      ).toBe(payment.amount);
      expect(payment.payerName.length).toBeGreaterThan(0);
      expect(
        roster.members.some((row) => row.id === payment.payerMemberId),
      ).toBe(true);
      for (const participant of payment.participants) {
        expect(participant.name.length).toBeGreaterThan(0);
        expect(
          roster.members.some((row) => row.id === participant.memberId),
        ).toBe(true);
      }
    }

    // The one row that tells the two readings of the split rule apart:
    // $50.00 across three is [1667, 1667, 1666] — the remainder cent goes
    // one each to the first two — and never [1668, 1666, 1666].
    const tacos = payments.find(
      (payment) => payment.id === "demo-payment-tacos",
    );
    expect(tacos?.amount).toBe(5000);
    expect(tacos?.participants.map((p) => p.shareAmount)).toEqual([
      1667, 1667, 1666,
    ]);

    // The arithmetic the balances have to be: what each member paid, less
    // what they owe. Recomputing it here is the point — a hardcoded
    // balance would agree with the entries only until one of them moved.
    const net = new Map<string, number>();
    for (const payment of payments) {
      net.set(
        payment.payerMemberId,
        (net.get(payment.payerMemberId) ?? 0) + payment.amount,
      );
      for (const participant of payment.participants) {
        net.set(
          participant.memberId,
          (net.get(participant.memberId) ?? 0) - participant.shareAmount,
        );
      }
    }
    // Every cent paid is a cent somebody owes.
    expect([...net.values()].reduce((sum, amount) => sum + amount, 0)).toBe(0);
    const viewerNet = net.get(viewer!.id) ?? 0;
    expect(viewerNet).not.toBe(0);

    // The moves settle exactly that ledger: applying them zeroes
    // everybody, which no other set of moves can do.
    for (const move of balances) {
      expect(move.amount).toBeGreaterThan(0);
      expect(move.from.name.length).toBeGreaterThan(0);
      expect(move.to.name.length).toBeGreaterThan(0);
      net.set(move.from.id, (net.get(move.from.id) ?? 0) + move.amount);
      net.set(move.to.id, (net.get(move.to.id) ?? 0) - move.amount);
    }
    for (const amount of net.values()) expect(amount).toBe(0);

    // The reader's own read is those same moves told from their side.
    expect(
      balances.some(
        (move) => move.from.id === viewer!.id || move.to.id === viewer!.id,
      ),
    ).toBe(true);
    expect(mine.netBalance).toBe(viewerNet);
    expect(mine.details.reduce((sum, detail) => sum + detail.amount, 0)).toBe(
      -mine.netBalance,
    );
    for (const detail of mine.details) {
      expect(detail.person.name.length).toBeGreaterThan(0);
      expect(roster.members.some((row) => row.id === detail.person.id)).toBe(
        true,
      );
    }

    expect(getUnhandledApiUrls()).toEqual([]);
  });

  it("gives every demo trip a ledger the sheet can draw", async () => {
    for (const tripId of DEMO_TRIP_IDS) {
      const { payments } = await apiFetch<{
        success: true;
        payments: PaymentRow[];
      }>(`/trips/${tripId}/payments`);
      const detail = await apiFetch<{
        success: true;
        trip: { startDate: string; endDate: string };
      }>(`/trips/${tripId}`);
      const roster = await apiFetch<{ success: true; members: MemberRow[] }>(
        `/trips/${tripId}/members`,
      );

      expect(payments.length).toBeGreaterThan(1);
      // A note and no note: the sheet drops an absent note rather than
      // printing a blank one, so both shapes have to be in the fixture.
      expect(payments.some((payment) => (payment.note ?? "").length > 0)).toBe(
        true,
      );
      expect(payments.some((payment) => payment.note === null)).toBe(true);
      // A settlement: one participant, and not the payer — the row the
      // sheet reads as "Settled up".
      expect(
        payments.filter(
          (payment) =>
            payment.participants.length === 1 &&
            payment.participants[0]!.memberId !== payment.payerMemberId,
        ).length,
      ).toBeGreaterThan(0);
      // A guest — the row the roster prints as "Guest", and a shape the
      // API allows on either side of an expense. Without a second person
      // a ledger nets to nothing and the sheet has no debt row at all,
      // which is why every trip here carries one.
      const guests = roster.members.filter((row) => row.userId === null);
      expect(guests.length).toBeGreaterThan(0);
      const guestIds = new Set(guests.map((row) => row.id));
      expect(
        payments.some(
          (payment) =>
            guestIds.has(payment.payerMemberId) ||
            payment.participants.some((p) => guestIds.has(p.memberId)),
        ),
      ).toBe(true);

      // Every day is inside the trip's own window, like every other date
      // in the fixture, and reads back on the viewer's calendar — the
      // zone the fixture writes its wall clocks in.
      for (const payment of payments) {
        const day = wallClock(payment.date, null).date;
        expect(day >= detail.trip.startDate && day <= detail.trip.endDate).toBe(
          true,
        );
      }

      // Two id spaces, never crossed: `createdBy` is a **user** id, while
      // the payer and every participant are **member** ids. Comparing one
      // to the other is what puts Edit on somebody else's row.
      const memberIds = new Set(roster.members.map((row) => row.id));
      const userIds = new Set(roster.members.map((row) => row.userId));
      for (const payment of payments) {
        expect(userIds.has(payment.createdBy)).toBe(true);
        expect(memberIds.has(payment.createdBy)).toBe(false);
        expect(memberIds.has(payment.payerMemberId)).toBe(true);
      }
      // And one row the viewer filed, which is the one whose detail
      // offers Edit — the viewer is never the organizer here.
      expect(
        payments.some((payment) => payment.createdBy === "demo-viewer"),
      ).toBe(true);
    }

    expect(getUnhandledApiUrls()).toEqual([]);
  });

  it("files the mode a travel write states, and keeps the one it does not", async () => {
    const tripId = DEMO_TRIP_ID;
    const roster = await apiFetch<{ success: true; members: MemberRow[] }>(
      `/trips/${tripId}/members`,
    );
    const trip = await apiFetch<{
      success: true;
      trip: { startDate: string; endDate: string };
    }>(`/trips/${tripId}`);
    // Priya has filed nothing, which is the member the demo's own form
    // posts for — so both creates below are inserts, not pair updates.
    const priya = roster.members.find((row) => row.id === "demo-priya")!;
    const list = () =>
      apiFetch<{ success: true; memberTravels: TravelRow[] }>(
        `/trips/${tripId}/member-travel`,
      );
    expect(
      (await list()).memberTravels.some((row) => row.memberId === priya.id),
    ).toBe(false);
    const post = (body: Record<string, unknown>) =>
      apiFetch<{ success: true; memberTravel: TravelRow }>(
        `/trips/${tripId}/member-travel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

    // A create that says nothing files the column's own default…
    const plain = await post({
      memberId: priya.id,
      travelType: "arrival",
      arrivalLocation: "SJD T2",
      arrivalTime: `${trip.trip.startDate}T19:40:00.000Z`,
    });
    expect(plain.memberTravel.transportMode).toBe("flight");

    // …a create that states a mode stores it…
    const hire = await post({
      memberId: priya.id,
      travelType: "departure",
      transportMode: "rental",
      departureLocation: "Marina Cabo San Lucas",
      departureTime: `${trip.trip.endDate}T17:00:00.000Z`,
    });
    expect(hire.memberTravel.transportMode).toBe("rental");

    // …and a create that says nothing about a pair already holding a
    // mode leaves that row's mode alone, while the fields it does state
    // still land. The API's own rule: `values` is the pair update's patch
    // as well as the insert's, so a mode the body does not carry must not
    // join it.
    const again = await post({
      memberId: priya.id,
      travelType: "departure",
      departureLocation: "Marina Cabo San Lucas, slip 4",
      departureTime: `${trip.trip.endDate}T17:30:00.000Z`,
    });
    expect(again.memberTravel.id).toBe(hire.memberTravel.id);
    expect(again.memberTravel.transportMode).toBe("rental");
    expect(again.memberTravel.departureLocation).toBe(
      "Marina Cabo San Lucas, slip 4",
    );

    // An edit states the mode, and the fields the patch does not mention
    // survive it — which is what the PUT's whitelist is for: a key it
    // omits is that field dropped on every edit the demo serves.
    const edited = await apiFetch<{ success: true; memberTravel: TravelRow }>(
      `/member-travel/${hire.memberTravel.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transportMode: "train" }),
      },
    );
    expect(edited.memberTravel.transportMode).toBe("train");
    expect(edited.memberTravel.departureLocation).toBe(
      "Marina Cabo San Lucas, slip 4",
    );

    // And both writers are visible on the next read, not only in the
    // answer they returned.
    const listed = await list();
    const read = (id: string) =>
      listed.memberTravels.find((row) => row.id === id);
    expect(read(plain.memberTravel.id)?.transportMode).toBe("flight");
    expect(read(hire.memberTravel.id)?.transportMode).toBe("train");

    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
  });

  it("records, edits and soft-deletes an expense", async () => {
    const tripId = DEMO_TRIP_ID;
    const roster = await apiFetch<{ success: true; members: MemberRow[] }>(
      `/trips/${tripId}/members`,
    );
    const viewer = roster.members.find((row) => row.userId === "demo-viewer")!;
    const others = roster.members.filter((row) => row.id !== viewer.id);
    const [first, second] = [others[0]!.id, others[1]!.id];

    const before = await apiFetch<{ success: true; netBalance: number }>(
      `/trips/${tripId}/balances/me`,
    );

    // $100.01 across three: the remainder is 2, so the shares are
    // [3334, 3334, 3333]. The form previews this and the server records
    // it, so the demo's own write has to answer with it too.
    const created = await apiFetch<{ success: true; payment: PaymentRow }>(
      `/trips/${tripId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Boat fuel",
          amount: 10001,
          payerMemberId: viewer.id,
          participants: [
            { memberId: viewer.id },
            { memberId: first },
            { memberId: second },
          ],
          note: "Venmo",
        }),
      },
    );
    expect(created.payment.participants.map((p) => p.shareAmount)).toEqual([
      3334, 3334, 3333,
    ]);
    expect(created.payment.payerName).toBe("You");
    expect(created.payment.note).toBe("Venmo");
    expect(created.payment.createdBy).toBe("demo-viewer");

    // It is in the trip's list, it stays out of the other trips' lists,
    // and it moves the reader's own position by what they paid less their
    // own share.
    const listed = await apiFetch<{ success: true; payments: PaymentRow[] }>(
      `/trips/${tripId}/payments`,
    );
    expect(listed.payments.some((row) => row.id === created.payment.id)).toBe(
      true,
    );
    const otherTrip = await apiFetch<{
      success: true;
      payments: PaymentRow[];
    }>(`/trips/${DEMO_TRIP_WEDDING_ID}/payments`);
    expect(
      otherTrip.payments.some((row) => row.id === created.payment.id),
    ).toBe(false);
    const afterCreate = await apiFetch<{ success: true; netBalance: number }>(
      `/trips/${tripId}/balances/me`,
    );
    expect(afterCreate.netBalance).toBe(before.netBalance + (10001 - 3334));

    // An edit recomputes the shares from the new amount — $90.01 across
    // three is [3001, 3000, 3000] — and an empty note is the clearing
    // value the server stores as null.
    const updated = await apiFetch<{ success: true; payment: PaymentRow }>(
      `/payments/${created.payment.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 9001, note: "" }),
      },
    );
    expect(updated.payment.amount).toBe(9001);
    expect(updated.payment.participants.map((p) => p.shareAmount)).toEqual([
      3001, 3000, 3000,
    ]);
    expect(updated.payment.note).toBeNull();
    const afterEdit = await apiFetch<{ success: true; netBalance: number }>(
      `/trips/${tripId}/balances/me`,
    );
    expect(afterEdit.netBalance).toBe(before.netBalance + (9001 - 3001));

    // The delete is soft: the row leaves the list and the arithmetic with
    // it, and a second delete is a 404 rather than a resurrection.
    await apiFetch(`/payments/${created.payment.id}`, { method: "DELETE" });
    const afterDelete = await apiFetch<{
      success: true;
      payments: PaymentRow[];
    }>(`/trips/${tripId}/payments`);
    expect(
      afterDelete.payments.some((row) => row.id === created.payment.id),
    ).toBe(false);
    const finalBalance = await apiFetch<{ success: true; netBalance: number }>(
      `/trips/${tripId}/balances/me`,
    );
    expect(finalBalance.netBalance).toBe(before.netBalance);
    await expect(
      apiFetch(`/payments/${created.payment.id}`, { method: "DELETE" }),
    ).rejects.toThrow();

    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
  });

  it("resolves a split scope against the demo's own roster", async () => {
    // The demo has no resolver on its read path — the roster never moves
    // there — so a scoped write is where the rule runs: the ids are
    // resolved through `splitForScope` (`lib/payments.ts`, the client's
    // half of the rule the API applies) and the row stores the snapshot
    // beside the scope it was resolved by.
    const tripId = DEMO_TRIP_ID;
    const roster = await apiFetch<{ success: true; members: MemberRow[] }>(
      `/trips/${tripId}/members`,
    );
    const viewer = roster.members.find((row) => row.userId === "demo-viewer")!;

    // `all_going` is every member who said going **plus every guest**, in
    // member-id order (D2). Cabo's roster is You, Liz and Sam going and
    // Nina the guest (no account behind her row), with Marco on `maybe`
    // and Priya on `no_response` left out — so the split is four people
    // even though one of them never answered anything. The order is also
    // the order the remainder cent is handed out in: $100.01 across the
    // four is [2501, 2500, 2500, 2500].
    const created = await apiFetch<{ success: true; payment: PaymentRow }>(
      `/trips/${tripId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Scoped boat fuel",
          amount: 10001,
          payerMemberId: viewer.id,
          splitScope: "all_going",
        }),
      },
    );
    expect(created.payment.splitScope).toBe("all_going");
    expect(created.payment.participants.map((p) => p.memberId)).toEqual([
      "demo-guest-cabo",
      "demo-liz",
      "demo-sam",
      viewer.id,
    ]);
    expect(created.payment.participants.map((p) => p.shareAmount)).toEqual([
      2501, 2500, 2500, 2500,
    ]);

    // An edit re-resolves the scope it is sent rather than keeping the
    // old list: `all_invited` is the whole roster, declines included, so
    // Marco and Priya are on this one — six people, $200.00, which is
    // [3334, 3334, 3333, 3333, 3333, 3333].
    const updated = await apiFetch<{ success: true; payment: PaymentRow }>(
      `/payments/${created.payment.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 20000, splitScope: "all_invited" }),
      },
    );
    expect(updated.payment.splitScope).toBe("all_invited");
    expect(updated.payment.participants.map((p) => p.memberId)).toEqual([
      "demo-guest-cabo",
      "demo-liz",
      "demo-marco",
      "demo-priya",
      "demo-sam",
      viewer.id,
    ]);
    expect(updated.payment.participants.map((p) => p.shareAmount)).toEqual([
      3334, 3334, 3333, 3333, 3333, 3333,
    ]);

    // And the ledger reads that snapshot, because that is all a demo read
    // has: the row is in the trip's list with the six people on it.
    const { payments } = await apiFetch<{
      success: true;
      payments: PaymentRow[];
    }>(`/trips/${tripId}/payments`);
    const listed = payments.find((row) => row.id === created.payment.id);
    expect(listed?.splitScope).toBe("all_invited");
    expect(listed?.participants.length).toBe(6);

    expect(inner).not.toHaveBeenCalled();
    expect(getUnhandledApiUrls()).toEqual([]);
  });
});
