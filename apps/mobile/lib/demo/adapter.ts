/**
 * The demo data layer: a fetch interceptor that serves the app's own
 * API endpoints from the fixture, with in-memory state for writes, so
 * the real query hooks, mutation flows and invalidations all work
 * unchanged — fully offline.
 *
 * Scope: installed only while `/demo` is mounted (see `app/demo.tsx`),
 * reverted on unmount. Every request the adapter serves is recorded in
 * `getDemoLog()`; an API URL it cannot serve is recorded as unhandled
 * instead of reaching the network, so the demo can never leak a real
 * request. Nothing here touches production stores, queries or routes.
 *
 * Reads served: `GET /trips/:id` for all three demo trips, members,
 * events,
 * accommodations, member-travel, the ledger (`payments`, `balances` and
 * `balances/me`, all computed from the fixture's expenses rather than
 * written down — see `tripBalances`), invitations (empty), the trip-settings
 * trio (sharePhone + notification pair + calendar flag), and the Places
 * autocomplete + details (a small invented list for the demo's own
 * destinations — invented names and addresses, no real business data,
 * no remote URLs — so the Location field offers selectable rows and
 * picking one fills the field the way a real suggestion would). Writes served in memory: RSVP, event/stay/
 * travel create/update/delete, payment create/update/delete (soft, as the
 * API's is), sharePhone, notification preferences,
 * calendar exclusion. `POST /flights/lookup` answers 404, which
 * `lookupFlight` already reads as "no such flight" — the travel form
 * still files by hand. Everything else answers the API 404 envelope.
 */

import type { DemoTrip, DemoPayment } from "@/lib/demo";
import { buildDemoTrips, DEMO_VIEWER_MEMBER_ID } from "@/lib/demo";
import { splitPreview } from "@/lib/payments";
import type { RsvpStatus } from "@/lib/rsvp";
import type {
  Accommodation,
  BalanceEntry,
  Event,
  MemberTravel,
  MemberWithProfile,
  MyBalanceDetail,
  Payment,
  PaymentParticipant,
  TripDetail,
} from "@journiful/shared/types";

export type DemoRequestLog = {
  method: string;
  path: string;
  status: number;
  /** False when no local handler matched and the request was refused. */
  served: boolean;
};

type DemoStore = {
  trips: DemoTrip[];
  events: Map<string, Event[]>;
  stays: Map<string, Accommodation[]>;
  travel: Map<string, MemberTravel[]>;
  members: Map<string, MemberWithProfile[]>;
  payments: Map<string, Payment[]>;
  sharePhone: Map<string, boolean>;
  notifications: Map<
    string,
    { dailyItinerary: boolean; tripMessages: boolean }
  >;
  counters: { event: number; stay: number; travel: number; payment: number };
};

function nowIso(): string {
  return new Date().toISOString();
}

function organizerOf(trip: DemoTrip): { userId: string; name: string } {
  const organizer = trip.members.find((member) => member.isOrganizer);
  return {
    userId: organizer?.userId ?? "demo-organizer",
    name: organizer?.name ?? "Sam",
  };
}

function memberRow(
  member: DemoTrip["members"][number],
): MemberWithProfile {
  return {
    id: member.id,
    userId: member.userId,
    displayName: member.name,
    profilePhotoUrl: null,
    handles: null,
    phoneNumber: member.phone,
    // `exactOptionalPropertyTypes` is on: an absent guest number is
    // omitted, never an explicit `undefined`.
    ...(member.guestPhone ? { guestPhone: member.guestPhone } : {}),
    status: member.status,
    isOrganizer: member.isOrganizer,
    sharePhone: member.sharePhone,
    createdAt: "2026-01-01T12:00:00.000Z",
  };
}

function eventRow(tripId: string, event: DemoTrip["events"][number]): Event {
  return {
    id: event.id,
    tripId,
    createdBy: "demo-viewer",
    name: event.name,
    description: event.description,
    eventType: event.type,
    location: event.place,
    locationLat: event.locationLat ?? null,
    locationLon: event.locationLon ?? null,
    startTime: event.startTime as unknown as Date,
    endTime: (event.endTime ?? null) as unknown as Date | null,
    allDay: event.allDay,
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
    place: null,
    placeName: event.placeName ?? null,
    placeAddress: event.placeAddress ?? null,
  };
}

function stayRow(tripId: string, stay: DemoTrip["stay"]): Accommodation {
  return {
    id: stay.id,
    tripId,
    createdBy: "demo-viewer",
    name: stay.name,
    address: stay.address,
    addressLat: stay.addressLat,
    addressLon: stay.addressLon,
    description: stay.description,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    links: (stay.links ?? []).map((link) => ({
      url: link.url,
      name: link.name ?? link.url,
    })),
    deletedAt: null,
    deletedBy: null,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
    place: null,
    placeName: stay.placeName ?? null,
    placeAddress: stay.placeAddress ?? null,
  };
}

function travelRow(tripId: string, record: DemoTrip["travel"][number]): MemberTravel {
  return {
    id: record.id,
    tripId,
    memberId: record.memberId,
    travelType: record.travelType,
    departureLocation: record.departureLocation,
    departureTime: (record.departureTime ?? null) as unknown as Date | null,
    arrivalLocation: record.arrivalLocation,
    arrivalTime: (record.arrivalTime ?? null) as unknown as Date | null,
    details: record.details,
    flightNumber: record.flightNumber,
    deletedAt: null,
    deletedBy: null,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
    memberName: record.memberName,
  };
}

/**
 * The trip's member rows: the only place a person's name comes from.
 * The server's own person map is built the same way
 * (`BalanceService.buildPersonMap`), off the trip's members.
 */
function rosterOf(store: DemoStore, tripId: string): MemberWithProfile[] {
  return store.members.get(tripId) ?? [];
}

/**
 * One member's name as the roster carries it, or `""`.
 *
 * A member id that is not on the trip has no name at all rather than an
 * invented one: the server joins names off the trip's members, so a
 * payment naming somebody else is a bug in the fixture, not a person to
 * make up.
 */
function nameOfMember(roster: MemberWithProfile[], memberId: string): string {
  return roster.find((row) => row.id === memberId)?.displayName ?? "";
}

/**
 * One participant row: the member, the share the split rule gave them,
 * and the name off the roster (`payment.service.ts` joins the same name
 * onto every participant, so the split arrives with everything it draws).
 */
function participantRow(
  paymentId: string,
  memberId: string,
  shareAmount: number,
  nameOf: (memberId: string) => string,
  index: number,
): PaymentParticipant {
  return {
    id: `${paymentId}-participant-${index + 1}`,
    paymentId,
    memberId,
    shareAmount,
    name: nameOf(memberId),
    createdAt: nowIso() as unknown as Date,
  };
}

/**
 * One stored expense: the API's entity, with the names resolved off the
 * roster and the shares **computed**, never written down.
 *
 * The shares are the server's own rule, applied to the participant list
 * in the order the fixture wrote it: `splitPreview` (`lib/payments.ts`)
 * is the repo's existing restatement of
 * `PaymentService.computeEqualShares` — integer division, with the
 * remainder cents going one each to the first `remainder` participants.
 * Reusing it rather than restating it here is what keeps the demo's
 * arithmetic and the form's preview from ever disagreeing, and it is why
 * a fixture row can only state the payer, the people and the total.
 */
function paymentRow(
  tripId: string,
  plan: DemoPayment,
  nameOf: (memberId: string) => string,
): Payment {
  const shares = splitPreview(plan.amount, plan.participants);
  return {
    id: plan.id,
    tripId,
    description: plan.description,
    note: plan.note,
    amount: plan.amount,
    // `payerMemberId` and every `participants[].memberId` are **member**
    // ids, while `createdBy` is a **user** id (`userIdOf` in the fixture).
    // The two spaces are never compared to each other.
    payerMemberId: plan.payerMemberId,
    payerName: nameOf(plan.payerMemberId),
    date: plan.date as unknown as Date,
    createdBy: plan.createdBy,
    participants: plan.participants.map((memberId, index) =>
      participantRow(plan.id, memberId, shares[index] ?? 0, nameOf, index),
    ),
    deletedAt: null,
    deletedBy: null,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
  };
}

/**
 * Every member's net position in cents over the trip's non-deleted
 * expenses: what they paid, minus what they owe.
 *
 * Mirrors `BalanceService.computeNetBalances`: the payer is credited the
 * whole amount, each participant is debited their own share, and the key
 * is the **member** id. Positive means owed money, negative means owing
 * it, and the map's total is always zero — every cent paid is a cent
 * somebody owes.
 *
 * Soft-deleted rows are dropped here, exactly as the server drops them
 * in its query (`isNull(payments.deletedAt)`): that is what makes a
 * delete move the ledger rather than just hide a row.
 */
function netBalancesOf(store: DemoStore, tripId: string): Map<string, number> {
  const net = new Map<string, number>();
  for (const payment of store.payments.get(tripId) ?? []) {
    if (payment.deletedAt !== null) continue;
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
  return net;
}

/**
 * The trip's simplified moves, computed from the expenses on every read —
 * never stored, and never written down beside them, because a balance
 * written by hand contradicts the entries the moment either changes.
 *
 * Mirrors `BalanceService.simplifyDebts`: zero balances are dropped,
 * creditors and debtors are each sorted largest first, and the largest
 * creditor is repeatedly matched with the largest debtor for
 * `min(the two)`, until every balance is zero. The result is the shortest
 * set of moves that settles the trip — not one row per expense, which is
 * why the sheet can say who to pay rather than who paid what.
 *
 * The person ids here are **member** ids, the space `moveFor` and the
 * payer line substitute "You" in, and the names come off the roster.
 */
function tripBalances(store: DemoStore, tripId: string): BalanceEntry[] {
  const roster = rosterOf(store, tripId);
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [memberId, amount] of netBalancesOf(store, tripId)) {
    if (amount > 0) creditors.push({ id: memberId, amount });
    else if (amount < 0) debtors.push({ id: memberId, amount: -amount });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const moves: BalanceEntry[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const transfer = Math.min(creditor.amount, debtor.amount);

    if (transfer > 0) {
      moves.push({
        from: { id: debtor.id, name: nameOfMember(roster, debtor.id) },
        to: { id: creditor.id, name: nameOfMember(roster, creditor.id) },
        amount: transfer,
      });
    }

    creditor.amount -= transfer;
    debtor.amount -= transfer;
    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return moves;
}

/**
 * The reader's own position, read off the moves above — the second half
 * of `BalanceService.getMyBalance`, verbatim: a move they are the debtor
 * of is money they owe (a positive detail), a move they are the creditor
 * of is money owed to them (a negative one), and the net is the details'
 * own sum with the sign flipped.
 */
function myBalanceOf(
  moves: BalanceEntry[],
  viewerMemberId: string,
): { netBalance: number; details: MyBalanceDetail[] } {
  let netBalance = 0;
  const details: MyBalanceDetail[] = [];

  for (const move of moves) {
    if (move.from.id === viewerMemberId) {
      netBalance -= move.amount;
      details.push({ person: move.to, amount: move.amount });
    } else if (move.to.id === viewerMemberId) {
      netBalance += move.amount;
      details.push({ person: move.from, amount: -move.amount });
    }
  }

  return { netBalance, details };
}

/**
 * The viewer's own **member** row on a trip, resolved the way the server
 * resolves a caller: the row whose `userId` is the signed-in account
 * (`BalanceService.getMyBalance`). Never the other way round — a user id
 * is not a member id.
 */
function viewerRowOf(
  store: DemoStore,
  tripId: string,
): MemberWithProfile | undefined {
  return rosterOf(store, tripId).find((row) => row.userId === "demo-viewer");
}

/** The member ids out of a write body's `participants` array. */
function memberIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    const memberId =
      typeof entry === "object" && entry !== null
        ? (entry as { memberId?: unknown }).memberId
        : null;
    if (typeof memberId === "string") ids.push(memberId);
  }
  return ids;
}

/**
 * Replace a row's participants and recompute every share from the row's
 * own amount — the server's own update path: a participants list replaces
 * the rows, and the shares come from the final amount (`updatePayment`
 * recomputes for the new list, or for the existing one when only the
 * amount changed).
 */
function setParticipants(
  row: Payment,
  memberIds: string[],
  nameOf: (memberId: string) => string,
): void {
  const shares = splitPreview(row.amount, memberIds);
  row.participants = memberIds.map((memberId, index) =>
    participantRow(row.id, memberId, shares[index] ?? 0, nameOf, index),
  );
}

function detailOf(trip: DemoTrip): TripDetail {
  const organizer = organizerOf(trip);
  return {
    id: trip.id,
    name: trip.title,
    destination: trip.location,
    destinationLat: null,
    destinationLon: null,
    startDate: trip.startDate,
    endDate: trip.endDate,
    // Empty on purpose, and it is the other half of the fixture's own
    // clock: a demo trip has no real zone, so every reader here falls
    // back to the device's (`wallClock`, `zoneAbbr` and
    // `zoneOffsetMinutes` all treat a falsy zone that way), and the
    // fixture writes its wall clocks in that same frame. The result is
    // that a 19:00 dinner reads 7:00 PM wherever the visitor is, and the
    // trip never disagrees with itself about which zone it is in.
    preferredTimezone: "",
    description: trip.description ?? null,
    coverImageUrl: null,
    createdBy: organizer.userId,
    allowMembersToAddEvents: false,
    showAllMembers: true,
    themeId: null,
    themeFont: null,
    cancelled: false,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
    // The trip's linked place, present only for its country: the
    // picker's autocomplete floor reads `placeCountry` off the trip
    // (`countryForTrip`), which is `place.country` here. `placeId` is
    // deliberately empty, not a demo id — the detail header's
    // `PlaceLink` pins a Maps URL to a real place id, and there is no
    // real place behind an invented venue. Empty reads as absent
    // (`placeMapsUrl` falls back to a plain search), which is exactly
    // what the fixture had before the country was needed.
    place: trip.placeCountry
      ? {
          placeId: "",
          name: trip.location,
          address: null,
          photoUrl: null,
          photoAttribution: null,
          photoSourceUri: null,
          country: trip.placeCountry,
          locality: null,
        }
      : null,
    placeName: null,
    placeAddress: null,
    organizers: [
      {
        id: organizer.userId,
        displayName: organizer.name,
        profilePhotoUrl: null,
        timezone: null,
      },
    ],
    memberCount: trip.members.length,
  };
}

/** Seed the in-memory server from the fixture trips. */
export function createDemoStore(trips: DemoTrip[]): DemoStore {
  const store: DemoStore = {
    trips,
    events: new Map(),
    stays: new Map(),
    travel: new Map(),
    members: new Map(),
    payments: new Map(),
    sharePhone: new Map(),
    notifications: new Map(),
    counters: { event: 0, stay: 0, travel: 0, payment: 0 },
  };
  for (const trip of trips) {
    store.events.set(
      trip.id,
      trip.events.map((event) => eventRow(trip.id, event)),
    );
    store.stays.set(trip.id, [stayRow(trip.id, trip.stay)]);
    store.travel.set(
      trip.id,
      trip.travel.map((record) => travelRow(trip.id, record)),
    );
    store.members.set(
      trip.id,
      trip.members.map((member) => memberRow(member)),
    );
    // The ledger is seeded after the roster, because every name on a
    // payment comes off it — the server joins them for the same reason.
    const roster = rosterOf(store, trip.id);
    store.payments.set(
      trip.id,
      trip.payments.map((plan) =>
        paymentRow(trip.id, plan, (memberId) => nameOfMember(roster, memberId)),
      ),
    );
    store.sharePhone.set(trip.id, true);
    store.notifications.set(trip.id, { dailyItinerary: true, tripMessages: true });
  }
  return store;
}

/**
 * The demo store every install site shares: all three fixtures seeded
 * into the in-memory server. One place, so the entry, the early
 * install and the guard's re-entry can never disagree about which
 * trips the demo serves — and so a read of any of the three ids
 * resolves while a fourth 404s.
 *
 * It sits beside `createDemoStore` rather than in `lib/demo.ts`
 * because `lib/demo.ts` holds the fixture's data and this module is
 * its server: `buildDemoStore` in `lib/demo.ts` would be a value
 * import of this module from a module this one already value-imports
 * (`buildDemoTrips`), i.e. a cycle whose failure mode is an undefined
 * binding at the first call rather than a compile error.
 */
export function buildDemoStore(today: Date = new Date()): DemoStore {
  return createDemoStore(buildDemoTrips(today));
}

type DemoBody = Record<string, unknown>;

function notFound(message: string): { status: 404; body: DemoBody } {
  return {
    status: 404,
    body: { success: false, error: { code: "NOT_FOUND", message } },
  };
}

function tripOf(store: DemoStore, tripId: string): DemoTrip | undefined {
  return store.trips.find((trip) => trip.id === tripId);
}

function findRowAnywhere<T extends { id: string }>(
  rows: Map<string, T[]>,
  id: string,
): { tripId: string; list: T[]; row: T } | null {
  for (const [tripId, list] of rows) {
    const row = list.find((entry) => entry.id === id);
    if (row) return { tripId, list, row };
  }
  return null;
}

/**
 * Answer one API path from the store. Pure apart from the store's own
 * mutation on writes — no network, no clock reads beyond stamps.
 */
/**
 * The demo's places: the fixture's own destinations, so the sheets' place
 * fields offer selectable rows.
 *
 * Every row here is a real, findable place in a city the fixture already
 * names, and each one is a place the itinerary actually visits — the
 * picker's list and the events' snapshots are the same list, so a
 * suggestion and the row it fills can never describe different venues.
 * That is the deliberate reversal of the earlier rule that invented them:
 * a demo whose addresses lead nowhere teaches the reader the wrong thing
 * about the Maps verb, which is the one thing on an event the app hands
 * off. The rentals stay invented, because a holiday let has no Maps
 * listing to be real — see `lib/demo.ts`.
 *
 * What has not changed: no remote URLs (a photo of a named business may
 * not be stored at all — see `lib/placeholder.ts`), no place id, and
 * coordinates that are rough area points, good enough to pin a details
 * answer and fill the field.
 *
 * `country` is what the picker's own floor filters on:
 * `/locations/autocomplete` narrows to the requested country before it
 * matches the query, so the wedding in Todos Santos is never offered a
 * San Diego venue. The list carries no city without a trip, and no trip
 * without its own city.
 */
type DemoPlace = {
  placeId: string;
  shortName: string;
  displayName: string;
  displayAddress: string;
  types: string[];
  /** ISO 3166-1 alpha-2, matching the trip's own `placeCountry`. */
  country: string;
  lat: number;
  lon: number;
};

export const DEMO_PLACES: readonly DemoPlace[] = [
  // Cabo San Lucas: the beach trip's own week, house first.
  {
    placeId: "demo-place-casa-verde",
    shortName: "Casa Verde",
    displayName: "Casa Verde",
    displayAddress: "Calle del Sol 12, Cabo San Lucas, Mexico",
    types: ["lodging"],
    country: "MX",
    lat: 22.8951,
    lon: -109.9112,
  },
  {
    placeId: "demo-place-el-paisa",
    shortName: "Taquería El Paisa",
    displayName: "Taquería El Paisa",
    displayAddress: "Boulevard Lázaro Cárdenas, Cabo San Lucas, BCS, Mexico",
    types: ["food_and_drink"],
    country: "MX",
    lat: 22.8889,
    lon: -109.9167,
  },
  {
    placeId: "demo-place-rooftop-360",
    shortName: "The Rooftop 360",
    displayName: "The Rooftop 360",
    displayAddress: "Corazón Cabo, Cabo San Lucas, BCS, Mexico",
    types: ["nightlife"],
    country: "MX",
    lat: 22.8905,
    lon: -109.9136,
  },
  {
    placeId: "demo-place-marina-cabo",
    shortName: "Marina Cabo San Lucas",
    displayName: "Marina Cabo San Lucas",
    displayAddress: "Blvd. Marina, Cabo San Lucas, BCS, Mexico",
    types: ["outdoors"],
    country: "MX",
    lat: 22.8891,
    lon: -109.9098,
  },
  {
    placeId: "demo-place-el-medano",
    shortName: "Playa El Médano",
    displayName: "Playa El Médano",
    displayAddress: "Playa El Médano, Cabo San Lucas, BCS, Mexico",
    types: ["outdoors"],
    country: "MX",
    lat: 22.8896,
    lon: -109.9021,
  },
  {
    placeId: "demo-place-santa-maria",
    shortName: "Playa Santa María",
    displayName: "Playa Santa María",
    displayAddress: "Playa Santa María, Cabo San Lucas, BCS, Mexico",
    types: ["outdoors"],
    country: "MX",
    lat: 22.8918,
    lon: -109.9004,
  },
  {
    placeId: "demo-place-solomons-landing",
    shortName: "Solomon's Landing",
    displayName: "Solomon's Landing",
    displayAddress: "Blvd. Paseo de la Marina, Cabo San Lucas, BCS, Mexico",
    types: ["food_and_drink"],
    country: "MX",
    lat: 22.8925,
    lon: -109.9077,
  },
  // Todos Santos: the wedding's four days.
  {
    placeId: "demo-place-casa-marea",
    shortName: "Casa Marea",
    displayName: "Casa Marea",
    displayAddress: "Calle del Mar 8, Todos Santos, Mexico",
    types: ["lodging"],
    country: "MX",
    lat: 23.4489,
    lon: -110.2231,
  },
  {
    placeId: "demo-place-cien-palmas",
    shortName: "Cien Palmas",
    displayName: "Cien Palmas",
    displayAddress: "Centro, Todos Santos, BCS, Mexico",
    types: ["food_and_drink"],
    country: "MX",
    lat: 23.4505,
    lon: -110.2262,
  },
  {
    placeId: "demo-place-hacienda-todos-santos",
    shortName: "Hotel Hacienda Todos Los Santos",
    displayName: "Hotel Hacienda Todos Los Santos",
    displayAddress: "Benito Juárez, Todos Santos, BCS, Mexico",
    types: ["arts_and_entertainment"],
    country: "MX",
    lat: 23.4521,
    lon: -110.2246,
  },
  // San Diego: the bachelor party's two nights.
  {
    placeId: "demo-place-wavecrest",
    shortName: "Wavecrest",
    displayName: "Wavecrest",
    displayAddress: "Ocean Front Walk, Pacific Beach, San Diego, USA",
    types: ["lodging"],
    country: "US",
    lat: 32.794,
    lon: -117.2543,
  },
  {
    placeId: "demo-place-pacific-beach",
    shortName: "Pacific Beach",
    displayName: "Pacific Beach",
    displayAddress: "Pacific Beach, San Diego, CA, USA",
    types: ["outdoors"],
    country: "US",
    lat: 32.798,
    lon: -117.253,
  },
  {
    placeId: "demo-place-petco-park",
    shortName: "Petco Park",
    displayName: "Petco Park",
    displayAddress: "100 Park Blvd, San Diego, CA, USA",
    types: ["arts_and_entertainment"],
    country: "US",
    lat: 32.7076,
    lon: -117.157,
  },
  {
    placeId: "demo-place-greystone",
    shortName: "Greystone Steakhouse",
    displayName: "Greystone Steakhouse",
    displayAddress: "658 5th Ave, San Diego, CA, USA",
    types: ["food_and_drink"],
    country: "US",
    lat: 32.7123,
    lon: -117.1597,
  },
  {
    placeId: "demo-place-shout-house",
    shortName: "The Shout! House",
    displayName: "The Shout! House",
    displayAddress: "655 4th Ave, San Diego, CA, USA",
    types: ["nightlife"],
    country: "US",
    lat: 32.7121,
    lon: -117.1606,
  },
];

/** One `key=value` out of a raw query string, without `URLSearchParams` (no Hermes dependency for a stub). */
function queryParam(query: string, key: string): string {
  const clean = query.startsWith("?") ? query.slice(1) : query;
  for (const pair of clean.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    let decodedKey: string;
    try {
      decodedKey = decodeURIComponent(rawKey.replace(/\+/g, " "));
    } catch {
      continue;
    }
    if (decodedKey !== key) continue;
    const rawValue = eq < 0 ? "" : pair.slice(eq + 1);
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      return rawValue;
    }
  }
  return "";
}

export function handleDemoRequest(
  store: DemoStore,
  method: string,
  path: string,
  rawBody?: string,
  query: string = "",
): { status: number; body: unknown } {
  const body = (rawBody ? safeParse(rawBody) : {}) as DemoBody;
  const verb = method.toUpperCase();

  const tripMatch = /^\/trips\/([^/]+)(\/.*)?$/.exec(path);
  if (tripMatch) {
    const tripId = decodeURIComponent(tripMatch[1]!);
    const rest = tripMatch[2] ?? "";
    const trip = tripOf(store, tripId);

    if (verb === "GET" && rest === "") {
      if (!trip) return notFound("Trip not found");
      return { status: 200, body: { success: true, trip: detailOf(trip) } };
    }
    if (verb === "GET" && rest === "/members") {
      if (!trip) return notFound("Trip not found");
      return { status: 200, body: { success: true, members: store.members.get(tripId) ?? [] } };
    }
    if (verb === "GET" && rest === "/events") {
      if (!trip) return notFound("Trip not found");
      return { status: 200, body: { success: true, events: store.events.get(tripId) ?? [] } };
    }
    if (verb === "GET" && rest === "/accommodations") {
      if (!trip) return notFound("Trip not found");
      return {
        status: 200,
        body: { success: true, accommodations: store.stays.get(tripId) ?? [] },
      };
    }
    if (verb === "GET" && rest === "/member-travel") {
      if (!trip) return notFound("Trip not found");
      return {
        status: 200,
        body: { success: true, memberTravels: store.travel.get(tripId) ?? [] },
      };
    }
    if (verb === "GET" && rest === "/payments") {
      if (!trip) return notFound("Trip not found");
      return {
        status: 200,
        body: {
          success: true,
          // Soft-deleted rows stop being served, exactly as the API's
          // own list filters them (`getPaymentsByTrip`, `deletedAt IS
          // NULL`). Nothing here asks for deleted rows: there is no
          // Deleted-items view.
          payments: (store.payments.get(tripId) ?? []).filter(
            (payment) => payment.deletedAt === null,
          ),
        },
      };
    }
    if (verb === "GET" && rest === "/balances") {
      if (!trip) return notFound("Trip not found");
      // Computed from the expenses on every read, never stored — see
      // `tripBalances`.
      return {
        status: 200,
        body: { success: true, balances: tripBalances(store, tripId) },
      };
    }
    if (verb === "GET" && rest === "/balances/me") {
      if (!trip) return notFound("Trip not found");
      const viewer = viewerRowOf(store, tripId);
      // The server fails closed here (403: only a trip's members may
      // read its money) and deliberately never falls back to zeros — a
      // 200 with an empty ledger reads as "you owe nothing". Every demo
      // trip carries the viewer's row, so this is the same shape the
      // sibling RSVP handler answers for a viewer who is not on the
      // trip.
      if (!viewer) return notFound("Viewer is not on this trip");
      return {
        status: 200,
        body: {
          success: true,
          ...myBalanceOf(tripBalances(store, tripId), viewer.id),
        },
      };
    }
    if (verb === "GET" && rest === "/invitations") {
      if (!trip) return notFound("Trip not found");
      return { status: 200, body: { success: true, invitations: [] } };
    }
    if (verb === "GET" && rest === "/my-settings") {
      if (!trip) return notFound("Trip not found");
      return {
        status: 200,
        body: {
          success: true,
          sharePhone: store.sharePhone.get(tripId) ?? true,
          calendarExcluded: false,
        },
      };
    }
    if (verb === "PATCH" && rest === "/my-settings") {
      if (!trip) return notFound("Trip not found");
      const sharePhone = typeof body.sharePhone === "boolean" ? body.sharePhone : true;
      store.sharePhone.set(tripId, sharePhone);
      return { status: 200, body: { success: true, sharePhone, calendarExcluded: false } };
    }
    if (verb === "GET" && rest === "/notification-preferences") {
      if (!trip) return notFound("Trip not found");
      return {
        status: 200,
        body: {
          success: true,
          preferences: store.notifications.get(tripId) ?? {
            dailyItinerary: true,
            tripMessages: true,
          },
        },
      };
    }
    if (verb === "PUT" && rest === "/notification-preferences") {
      if (!trip) return notFound("Trip not found");
      const next = {
        dailyItinerary: body.dailyItinerary !== false,
        tripMessages: body.tripMessages !== false,
      };
      store.notifications.set(tripId, next);
      return { status: 200, body: { success: true, preferences: next } };
    }
    if (verb === "PUT" && rest === "/members/me/calendar") {
      if (!trip) return notFound("Trip not found");
      return { status: 200, body: { success: true } };
    }
    if (verb === "POST" && rest === "/rsvp") {
      if (!trip) return notFound("Trip not found");
      const status = body.status as RsvpStatus | undefined;
      if (status !== "going" && status !== "not_going" && status !== "maybe") {
        return {
          status: 400,
          body: { success: false, error: { code: "BAD_REQUEST", message: "Unknown RSVP status" } },
        };
      }
      const rows = store.members.get(tripId) ?? [];
      const viewer = rows.find((row) => row.userId === "demo-viewer");
      if (!viewer) return notFound("Viewer is not on this trip");
      viewer.status = status;
      if (typeof body.sharePhone === "boolean") viewer.sharePhone = body.sharePhone;
      return {
        status: 200,
        body: {
          success: true,
          member: {
            id: viewer.id,
            userId: viewer.userId,
            displayName: viewer.displayName,
            profilePhotoUrl: null,
            status: viewer.status,
            isOrganizer: viewer.isOrganizer,
            sharePhone: viewer.sharePhone,
          },
        },
      };
    }
    if (verb === "POST" && rest === "/events") {
      if (!trip) return notFound("Trip not found");
      store.counters.event += 1;
      const row: Event = {
        id: `demo-event-created-${store.counters.event}`,
        tripId,
        createdBy: "demo-viewer",
        name: typeof body.name === "string" ? body.name : "Untitled event",
        description: typeof body.description === "string" ? body.description : null,
        eventType: asEventType(body.eventType),
        location: typeof body.location === "string" ? body.location : null,
        locationLat: typeof body.locationLat === "number" ? body.locationLat : null,
        locationLon: typeof body.locationLon === "number" ? body.locationLon : null,
        startTime: (typeof body.startTime === "string" ? body.startTime : nowIso()) as unknown as Date,
        endTime: (typeof body.endTime === "string" ? body.endTime : null) as unknown as Date | null,
        allDay: body.allDay === true,
        links: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: nowIso() as unknown as Date,
        updatedAt: nowIso() as unknown as Date,
        place: null,
        placeName: typeof body.placeName === "string" ? body.placeName : null,
        placeAddress: typeof body.placeAddress === "string" ? body.placeAddress : null,
      };
      store.events.get(tripId)?.push(row);
      return { status: 201, body: { success: true, event: row } };
    }
    if (verb === "POST" && rest === "/accommodations") {
      if (!trip) return notFound("Trip not found");
      store.counters.stay += 1;
      const row: Accommodation = {
        id: `demo-stay-created-${store.counters.stay}`,
        tripId,
        createdBy: "demo-viewer",
        name: typeof body.name === "string" ? body.name : "Untitled stay",
        address: typeof body.address === "string" ? body.address : null,
        addressLat: typeof body.addressLat === "number" ? body.addressLat : null,
        addressLon: typeof body.addressLon === "number" ? body.addressLon : null,
        description: typeof body.description === "string" ? body.description : null,
        checkIn: typeof body.checkIn === "string" ? body.checkIn : null,
        checkOut: typeof body.checkOut === "string" ? body.checkOut : null,
        links: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: nowIso() as unknown as Date,
        updatedAt: nowIso() as unknown as Date,
        place: null,
        placeName: typeof body.placeName === "string" ? body.placeName : null,
        placeAddress: typeof body.placeAddress === "string" ? body.placeAddress : null,
      };
      store.stays.get(tripId)?.push(row);
      return { status: 201, body: { success: true, accommodation: row } };
    }
    if (verb === "POST" && rest === "/payments") {
      if (!trip) return notFound("Trip not found");
      store.counters.payment += 1;
      const roster = rosterOf(store, tripId);
      const nameOf = (memberId: string) => nameOfMember(roster, memberId);
      const payerMemberId =
        typeof body.payerMemberId === "string"
          ? body.payerMemberId
          : DEMO_VIEWER_MEMBER_ID;
      const row: Payment = {
        id: `demo-payment-created-${store.counters.payment}`,
        tripId,
        description:
          typeof body.description === "string"
            ? body.description
            : "Untitled expense",
        // "" is the form's clearing value and the server stores it as
        // null; an absent note stays absent.
        note:
          typeof body.note === "string" && body.note !== "" ? body.note : null,
        amount:
          typeof body.amount === "number" && Number.isInteger(body.amount)
            ? body.amount
            : 0,
        payerMemberId,
        payerName: nameOf(payerMemberId),
        date: (typeof body.date === "string"
          ? body.date
          : nowIso()) as unknown as Date,
        // The viewer filed it, which is what the detail's Edit predicate
        // reads — `createdBy` is a **user** id, and this is the demo
        // session's own (`DEMO_AUTH_USER.id`).
        createdBy: "demo-viewer",
        participants: [],
        deletedAt: null,
        deletedBy: null,
        createdAt: nowIso() as unknown as Date,
        updatedAt: nowIso() as unknown as Date,
      };
      // The shares are the server's rule, over the participants in the
      // order they arrived — that order is what hands the remainder
      // cents out, and the form sent it for exactly this reason.
      setParticipants(row, memberIdsFrom(body.participants), nameOf);
      store.payments.get(tripId)?.push(row);
      return { status: 201, body: { success: true, payment: row } };
    }
    if (verb === "POST" && rest === "/member-travel") {
      if (!trip) return notFound("Trip not found");
      store.counters.travel += 1;
      const row: MemberTravel = {
        id: `demo-travel-created-${store.counters.travel}`,
        tripId,
        memberId: typeof body.memberId === "string" ? body.memberId : "demo-you",
        travelType: body.travelType === "departure" ? "departure" : "arrival",
        departureLocation: typeof body.departureLocation === "string" ? body.departureLocation : null,
        departureTime: (typeof body.departureTime === "string" ? body.departureTime : null) as unknown as Date | null,
        arrivalLocation: typeof body.arrivalLocation === "string" ? body.arrivalLocation : null,
        arrivalTime: (typeof body.arrivalTime === "string" ? body.arrivalTime : null) as unknown as Date | null,
        details: typeof body.details === "string" ? body.details : null,
        flightNumber: typeof body.flightNumber === "string" ? body.flightNumber : null,
        deletedAt: null,
        deletedBy: null,
        createdAt: nowIso() as unknown as Date,
        updatedAt: nowIso() as unknown as Date,
        memberName: "You",
      };
      store.travel.get(tripId)?.push(row);
      return { status: 201, body: { success: true, memberTravel: row } };
    }
  }

  const eventMatch = /^\/(events)\/([^/]+)$/.exec(path);
  if (eventMatch) {
    const id = decodeURIComponent(eventMatch[2]!);
    const found = findRowAnywhere(store.events, id);
    if (!found) return notFound("Event not found");
    if (verb === "PUT") {
      Object.assign(found.row, patchOf(body, ["name", "description", "location", "startTime", "endTime", "allDay", "locationLat", "locationLon", "placeName", "placeAddress"]), {
        ...(typeof body.eventType === "string" ? { eventType: asEventType(body.eventType) } : {}),
        updatedAt: nowIso(),
      });
      return { status: 200, body: { success: true, event: found.row } };
    }
    if (verb === "DELETE") {
      found.list.splice(found.list.indexOf(found.row), 1);
      return { status: 200, body: { success: true } };
    }
  }

  const stayMatch = /^\/(accommodations)\/([^/]+)$/.exec(path);
  if (stayMatch) {
    const id = decodeURIComponent(stayMatch[2]!);
    const found = findRowAnywhere(store.stays, id);
    if (!found) return notFound("Stay not found");
    if (verb === "PUT") {
      Object.assign(
        found.row,
        patchOf(body, ["name", "address", "description", "checkIn", "checkOut", "addressLat", "addressLon", "placeName", "placeAddress"]),
        { updatedAt: nowIso() },
      );
      return { status: 200, body: { success: true, accommodation: found.row } };
    }
    if (verb === "DELETE") {
      found.list.splice(found.list.indexOf(found.row), 1);
      return { status: 200, body: { success: true } };
    }
  }

  const paymentMatch = /^\/payments\/([^/]+)$/.exec(path);
  if (paymentMatch) {
    const id = decodeURIComponent(paymentMatch[1]!);
    const found = findRowAnywhere(store.payments, id);
    // A soft-deleted row is not addressable: the server's update and
    // delete both read through `deletedAt IS NULL`, so a second delete
    // (or an edit of a row somebody removed) is a 404 rather than a
    // resurrection.
    if (!found || found.row.deletedAt !== null) {
      return notFound("Payment not found");
    }
    const nameOf = (memberId: string) =>
      nameOfMember(store.members.get(found.tripId) ?? [], memberId);

    if (verb === "PUT") {
      if (typeof body.description === "string") {
        found.row.description = body.description;
      }
      if (typeof body.date === "string") {
        found.row.date = body.date as unknown as Date;
      }
      // "" clears the note (the server stores it as null); `null` itself
      // is a 400 on the real update schema, so a non-string is ignored.
      if (typeof body.note === "string") {
        found.row.note = body.note === "" ? null : body.note;
      }
      if (typeof body.amount === "number" && Number.isInteger(body.amount)) {
        found.row.amount = body.amount;
      }
      if (typeof body.payerMemberId === "string") {
        found.row.payerMemberId = body.payerMemberId;
        found.row.payerName = nameOf(body.payerMemberId);
      }
      found.row.updatedAt = nowIso() as unknown as Date;

      // The shares follow the amount, exactly as the server recomputes
      // them: a new participants list replaces the rows with shares of
      // the final amount, and an amount on its own recomputes the
      // participants already on the row.
      if (Array.isArray(body.participants)) {
        setParticipants(found.row, memberIdsFrom(body.participants), nameOf);
      } else if (typeof body.amount === "number") {
        setParticipants(
          found.row,
          found.row.participants.map((participant) => participant.memberId),
          nameOf,
        );
      }
      return { status: 200, body: { success: true, payment: found.row } };
    }
    if (verb === "DELETE") {
      // Soft, as the API's is: the row keeps its place and stops being
      // served, which is what moves the balances — the net and the moves
      // are recomputed from the rows that are still there.
      found.row.deletedAt = nowIso() as unknown as Date;
      found.row.deletedBy = "demo-viewer";
      return { status: 204, body: { success: true } };
    }
  }

  const travelMatch = /^\/(member-travel)\/([^/]+)$/.exec(path);
  if (travelMatch) {
    const id = decodeURIComponent(travelMatch[2]!);
    const found = findRowAnywhere(store.travel, id);
    if (!found) return notFound("Travel record not found");
    if (verb === "PUT") {
      Object.assign(
        found.row,
        patchOf(body, ["travelType", "departureLocation", "departureTime", "arrivalLocation", "arrivalTime", "details", "flightNumber"]),
        { updatedAt: nowIso() },
      );
      return { status: 200, body: { success: true, memberTravel: found.row } };
    }
    if (verb === "DELETE") {
      found.list.splice(found.list.indexOf(found.row), 1);
      return { status: 200, body: { success: true } };
    }
  }

  if (verb === "GET" && path.startsWith("/locations/autocomplete")) {
    // The invented list, filtered by the query the caller typed: typing
    // shows selectable rows, and picking one fills the field through
    // the details stub below. An empty query offers the whole list;
    // no match offers nothing (plus the picker's own typed-text row).
    //
    // A trip-scoped picker also sends the trip's own `country`, and
    // this list honours it before it matches: the wedding in Todos
    // Santos is never offered a San Diego venue. No country means the
    // whole list, which is what the destination picker (`trips/new`)
    // sends — it is itself choosing the country.
    const country = queryParam(query, "country").trim().toUpperCase();
    const scoped =
      country === ""
        ? DEMO_PLACES
        : DEMO_PLACES.filter((place) => place.country === country);
    const needle = queryParam(query, "q").trim().toLowerCase();
    const matches = scoped.filter(
      (place) =>
        needle === "" ||
        `${place.displayName} ${place.displayAddress}`.toLowerCase().includes(needle),
    );
    return {
      status: 200,
      body: matches.map((place) => ({
        placeId: place.placeId,
        shortName: place.shortName,
        displayName: place.displayName,
        displayAddress: place.displayAddress,
        types: [...place.types],
      })),
    };
  }

  if (verb === "GET" && path.startsWith("/locations/details")) {
    // Whatever the list above returned resolves here, so selecting a
    // row commits its label and attaches coordinates the way a real
    // suggestion would. Unknown ids 404 into the picker's own
    // typed-text fallback.
    const placeId = queryParam(query, "placeId");
    const place = DEMO_PLACES.find((entry) => entry.placeId === placeId);
    if (!place) return notFound("Place not found");
    return {
      status: 200,
      body: {
        placeId: place.placeId,
        displayPlace: place.displayName,
        displayAddress: place.displayAddress,
        lat: place.lat,
        lon: place.lon,
      },
    };
  }

  // Flight autofill has no demo backend; 404 is the caller's own "no
  // such flight" signal, and the travel form still files by hand.
  if (verb === "POST" && path === "/flights/lookup") {
    return notFound("No demo flight data");
  }

  return notFound(`No demo handler for ${verb} ${path}`);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function asEventType(value: unknown): Event["eventType"] {
  const known = [
    "travel",
    "food_and_drink",
    "arts_and_entertainment",
    "outdoors",
    "nightlife",
    "wellness",
    "shopping",
    "lodging",
    "misc",
  ] as const;
  if (typeof value === "string" && (known as readonly string[]).includes(value)) {
    return value as Event["eventType"];
  }
  return "misc";
}

function patchOf(body: DemoBody, keys: string[]): DemoBody {
  const patch: DemoBody = {};
  for (const key of keys) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  return patch;
}

function splitPath(url: string): string | null {
  const marker = "/api/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const after = url.slice(at + marker.length - 1);
  const cut = after.indexOf("?");
  return cut < 0 ? after : after.slice(0, cut);
}

/** The raw query string for a split path (`""` when the URL carries none). */
function splitQuery(url: string): string {
  const marker = "/api/";
  const at = url.indexOf(marker);
  if (at < 0) return "";
  const after = url.slice(at + marker.length - 1);
  const cut = after.indexOf("?");
  return cut < 0 ? "" : after.slice(cut + 1);
}

let wrappedFetch: typeof fetch | null = null;
let activeStore: DemoStore | null = null;
const demoLog: DemoRequestLog[] = [];
const unhandledApi: string[] = [];

/** Every request the demo served or refused, in order. */
export function getDemoLog(): DemoRequestLog[] {
  return [...demoLog];
}

/** API URLs that reached the wrapped fetch — always a demo bug. */
export function getUnhandledApiUrls(): string[] {
  return [...unhandledApi];
}

/** Clear the recorded log (tests; the mount keeps one log per visit). */
export function resetDemoLog(): void {
  demoLog.length = 0;
  unhandledApi.length = 0;
}

/**
 * Replace `globalThis.fetch` with the demo handler. Idempotent while
 * mounted (StrictMode renders twice): the first install wins and the
 * store is refreshed. Non-API URLs (bundled assets, if any) pass
 * through to the wrapped fetch; API URLs never do.
 */
export function installDemoFetch(store: DemoStore): void {
  activeStore = store;
  if (wrappedFetch) return;
  wrappedFetch = globalThis.fetch;
  const inner = wrappedFetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? "GET";
    const path = splitPath(href);
    if (path === null || !activeStore) {
      if (href.includes("/api/")) unhandledApi.push(`${method} ${href}`);
      return inner(url as string, init);
    }
    const store = activeStore;
    const outcome = handleDemoRequest(
      store,
      method,
      path,
      typeof init?.body === "string" ? init.body : undefined,
      splitQuery(href),
    );
    demoLog.push({ method, path, status: outcome.status, served: true });
    return {
      ok: outcome.status >= 200 && outcome.status < 300,
      status: outcome.status,
      statusText: outcome.status === 200 || outcome.status === 201 ? "OK" : "Not Found",
      json: () => Promise.resolve(outcome.body),
    } as Response;
  }) as typeof fetch;
}

/** Whether the demo interceptor is currently installed. */
export function isDemoFetchInstalled(): boolean {
  return wrappedFetch !== null;
}

/** Restore the wrapped fetch. A no-op when the demo was never mounted. */
export function uninstallDemoFetch(): void {
  if (wrappedFetch) {
    globalThis.fetch = wrappedFetch;
    wrappedFetch = null;
  }
  activeStore = null;
}
