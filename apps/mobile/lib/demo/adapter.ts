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
 * Reads served: `GET /trips`, `GET /trips/:id`, members, events,
 * accommodations, member-travel, invitations (empty), the trip-settings
 * trio (sharePhone + notification pair + calendar flag), and the Places
 * autocomplete (empty suggestions — the Location field degrades to free
 * text, still submittable). Writes served in memory: RSVP, event/stay/
 * travel create/update/delete, sharePhone, notification preferences,
 * calendar exclusion. `POST /flights/lookup` answers 404, which
 * `lookupFlight` already reads as "no such flight" — the travel form
 * still files by hand. Everything else answers the API 404 envelope.
 */

import type { DemoTrip } from "@/lib/demo";
import type { RsvpStatus } from "@/lib/rsvp";
import type {
  Accommodation,
  Event,
  MemberTravel,
  MemberWithProfile,
  TripDetail,
  TripSummary,
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
  sharePhone: Map<string, boolean>;
  notifications: Map<string, { dailyItinerary: boolean; tripMessages: boolean }>;
  counters: { event: number; stay: number; travel: number };
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

function summaryOf(trip: DemoTrip): TripSummary {
  const organizer = organizerOf(trip);
  return {
    id: trip.id,
    name: trip.title,
    destination: trip.location,
    startDate: trip.startDate,
    endDate: trip.endDate,
    coverImageUrl: null,
    themeId: null,
    themeFont: null,
    isOrganizer: false,
    rsvpStatus: "going",
    organizerInfo: [
      { id: organizer.userId, displayName: organizer.name, profilePhotoUrl: null },
    ],
    memberCount: trip.members.length,
    eventCount: trip.events.length,
    place: null,
    placeName: null,
    placeAddress: null,
  };
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
    preferredTimezone: "",
    description: null,
    coverImageUrl: null,
    createdBy: organizer.userId,
    allowMembersToAddEvents: false,
    showAllMembers: true,
    themeId: null,
    themeFont: null,
    cancelled: false,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
    place: null,
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
    sharePhone: new Map(),
    notifications: new Map(),
    counters: { event: 0, stay: 0, travel: 0 },
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
    store.sharePhone.set(trip.id, true);
    store.notifications.set(trip.id, { dailyItinerary: true, tripMessages: true });
  }
  return store;
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
export function handleDemoRequest(
  store: DemoStore,
  method: string,
  path: string,
  rawBody?: string,
): { status: number; body: unknown } {
  const body = (rawBody ? safeParse(rawBody) : {}) as DemoBody;
  const verb = method.toUpperCase();

  if (verb === "GET" && path === "/trips") {
    const data = store.trips.map(summaryOf);
    return {
      status: 200,
      body: {
        success: true,
        data,
        meta: { total: data.length, limit: data.length, hasMore: false, nextCursor: null },
      },
    };
  }

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
    // No live Places in the demo: empty suggestions, so the Location
    // field degrades to free text and the form stays submittable.
    return { status: 200, body: [] };
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

/** Restore the wrapped fetch. A no-op when the demo was never mounted. */
export function uninstallDemoFetch(): void {
  if (wrappedFetch) {
    globalThis.fetch = wrappedFetch;
    wrappedFetch = null;
  }
  activeStore = null;
}
