import type { ItineraryEvent } from "@/lib/itinerary";
import type { Member } from "@/lib/members";
import type { Stay } from "@/lib/stays";
import type { MockTravel } from "@/mocks/travel";

/**
 * The demo trip: the one sanctioned exception to "screens never read
 * static data" (`apps/mobile/AGENTS.md`). A public, anonymous demo
 * cannot show a real trip — that would publish real friends' names,
 * answers and flight times to anyone with the URL — so this fixture
 * is invented, and deliberately so.
 *
 * Three consequences of it being invented: every phone number stays in
 * the reserved 555 range so no real number can ever render; every
 * image slot is null so the rows fall back to their bundled
 * `PlaceholderImage` kinds (a remote cover would be a network call no
 * import scan can see); and the trip reads as mid-planning — one
 * person unanswered, one `maybe`, no cover photo — because a flawless
 * demo over-promises.
 *
 * Dates derive from today (the next Fri–Tue roughly eight weeks out),
 * so the trip never reads as stale. The landing's invitation band reads
 * this fixture live, so a shape change shows up there directly — no
 * capture to re-take.
 */
export type DemoTrip = {
  /** The adapter's key: the id the real `GET /trips/:id` reads serve. */
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  /** Invented prose so the real Description block renders in the demo. */
  description: string | null;
  /**
   * ISO 3166-1 alpha-2, the destination's country. The trip-scoped
   * pickers read it off the detail row (`placeCountry` →
   * `countryForTrip`) to floor an autocomplete to the trip's own
   * country — and the adapter's invented place list filters on the
   * same value, so a San Diego trip is never offered a Cabo venue.
   */
  placeCountry: string;
  members: Member[];
  stay: Stay;
  events: ItineraryEvent[];
  travel: MockTravel[];
};

/** The viewer's own row. The RSVP control and the roster row share it. */
export const DEMO_VIEWER_MEMBER_ID = "demo-you";

/** The demo trip's id: the landing's first `/demo?id=…` link carries it. */
export const DEMO_TRIP_ID = "demo-trip-cabo";

/** The wedding trip's id: the landing's second `/demo?id=…` link carries it. */
export const DEMO_TRIP_WEDDING_ID = "demo-trip-wedding";

/** The reunion trip's id: the landing's third `/demo?id=…` link carries it. */
export const DEMO_TRIP_REUNION_ID = "demo-trip-reunion";

/**
 * Every demo trip's id, in the landing's pinned card order (bachelor,
 * wedding, reunion). The early install, the guard and the card
 * selector all read this set, so a fourth trip cannot sneak in
 * through one door but not the others.
 */
export const DEMO_TRIP_IDS = [
  DEMO_TRIP_ID,
  DEMO_TRIP_WEDDING_ID,
  DEMO_TRIP_REUNION_ID,
] as const;

/**
 * The demo invitation's id: the adapter's invitation preview answers it
 * (`GET /invitations/:id/preview`), which is what the invite screen's
 * own query reads. The landing band no longer links it — the band shows
 * the invitation itself and links the trip it opens.
 */
export const DEMO_INVITATION_ID = "demo-invitation-cabo";

/** The demo invitation's inviter: the Cabo trip's organizer, who sent the text. */
export const DEMO_INVITER_NAME = "Sam";

/** The demo session: the anonymous visitor reads as this traveler. */
export const DEMO_AUTH_USER = {
  id: "demo-viewer",
  phoneNumber: "+15550000001",
  displayName: "You",
  profileComplete: true,
} as const;

function toIsoDay(moment: Date): string {
  const month = `${moment.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${moment.getUTCDate()}`.padStart(2, "0");
  return `${moment.getUTCFullYear()}-${month}-${day}`;
}

function addDays(dayIso: string, days: number): string {
  const moment = new Date(`${dayIso}T12:00:00.000Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return toIsoDay(moment);
}

function atClock(dayIso: string, clock: string): string {
  return `${dayIso}T${clock}:00.000Z`;
}

function member(
  id: string,
  name: string,
  status: Member["status"],
  phone: string,
  isOrganizer: boolean,
): Member {
  // Every trip carries the viewer's own row, each with its own row id
  // (row ids are globally unique per D2) but all resolving to the
  // same demo user, which is what the RSVP path keys on.
  const isViewer = id === DEMO_VIEWER_MEMBER_ID || id.startsWith(`${DEMO_VIEWER_MEMBER_ID}-`);
  return {
    id,
    userId: isViewer ? "demo-viewer" : `demo-user-${id}`,
    name,
    status,
    isOrganizer,
    phone,
    sharePhone: true,
    handles: null,
  };
}

function arrival(
  id: string,
  memberId: string,
  memberName: string,
  dayIso: string,
  clock: string,
  location = "SJD T1",
): MockTravel {
  return {
    id,
    memberId,
    memberName,
    travelType: "arrival",
    departureTime: null,
    departureLocation: null,
    arrivalTime: atClock(dayIso, clock),
    arrivalLocation: location,
    flightNumber: null,
    details: null,
    deletedAt: null,
  };
}

function event(
  id: string,
  name: string,
  type: ItineraryEvent["type"],
  dayIso: string,
  clock: string | null,
  endClock: string | null,
  place: string,
): ItineraryEvent {
  return {
    id,
    name,
    type,
    description: null,
    startTime: clock ? atClock(dayIso, clock) : atClock(dayIso, "09:00"),
    endTime: endClock ? atClock(dayIso, endClock) : null,
    allDay: clock === null,
    place,
    image: null,
    deletedAt: null,
  };
}

/**
 * The fixture, derived from the given today so tests can pin the
 * window without depending on the wall clock. Pass nothing in the
 * demo: it reads the real today.
 */
export function buildDemoTrip(today: Date = new Date()): DemoTrip {
  // Roughly eight weeks out, then forward to the next Friday: the
  // trip always opens on a Fri–Tue window.
  const friday = addDays(toIsoDay(today), 56);
  const forward = (5 - new Date(`${friday}T12:00:00.000Z`).getUTCDay() + 7) % 7;
  const startDate = addDays(friday, forward);
  const endDate = addDays(startDate, 4);
  const saturday = addDays(startDate, 1);
  const sunday = addDays(startDate, 2);
  const monday = addDays(startDate, 3);

  const members: Member[] = [
    member(DEMO_VIEWER_MEMBER_ID, "You", "going", "+15550000001", false),
    member("demo-liz", "Liz", "going", "+15550000002", false),
    member("demo-marco", "Marco", "maybe", "+15550000003", false),
    member("demo-priya", "Priya", "no_response", "+15550000004", false),
    member("demo-sam", "Sam", "going", "+15550000005", true),
  ];

  const stay: Stay = {
    id: "demo-stay",
    name: "Casa Verde",
    address: "Calle del Sol 12, Cabo San Lucas, Mexico",
    addressLat: null,
    addressLon: null,
    // The lilac band's door code, answered: the way in lives in the
    // description, which is what the stay screen is for.
    description:
      "Door code 4821, lockbox by the side gate. Wifi: CasaVerde-5G / tacos-tuesday.",
    checkIn: atClock(startDate, "16:00"),
    checkOut: atClock(endDate, "11:00"),
    image: null,
    links: [],
    deletedAt: null,
  };

  const events: ItineraryEvent[] = [
    event(
      "demo-event-tacos",
      "Tacos in town",
      "food_and_drink",
      saturday,
      "19:00",
      "21:00",
      "Taqueria El Faro",
    ),
    event(
      "demo-event-sunset",
      "Sunset drinks",
      "nightlife",
      saturday,
      "21:30",
      "23:00",
      "Rooftop Bar",
    ),
    event(
      "demo-event-boat",
      "Boat day",
      "outdoors",
      sunday,
      "09:00",
      "13:00",
      "Marina Gate C",
    ),
    event(
      "demo-event-beach",
      "Beach afternoon",
      "outdoors",
      sunday,
      "14:00",
      "17:00",
      "Playa El Medano",
    ),
    event(
      "demo-event-dinner",
      "Dinner in town",
      "food_and_drink",
      sunday,
      "19:30",
      "21:30",
      "Casa Verde grill",
    ),
    event(
      "demo-event-beachday",
      "Beach day",
      "outdoors",
      monday,
      null,
      null,
      "Playa Santa Maria",
    ),
    event(
      "demo-event-farewell",
      "Farewell dinner",
      "food_and_drink",
      monday,
      "19:00",
      "21:00",
      "Downtown Cabo",
    ),
  ];

  // Four friends land twenty minutes apart — the lilac band's four
  // Ubers, answered. Priya has shared nothing yet, so she reads as
  // owed at the foot of the board rather than missing from it.
  const travel: MockTravel[] = [
    arrival("demo-travel-liz", "demo-liz", "Liz", startDate, "11:40"),
    arrival("demo-travel-you", DEMO_VIEWER_MEMBER_ID, "You", startDate, "12:00"),
    arrival("demo-travel-marco", "demo-marco", "Marco", startDate, "12:20"),
    arrival("demo-travel-sam", "demo-sam", "Sam", startDate, "12:40"),
  ];

  return {
    id: DEMO_TRIP_ID,
    title: "Cabo",
    location: "Cabo San Lucas, Mexico",
    placeCountry: "MX",
    startDate,
    endDate,
    description:
      "Five days in Cabo San Lucas with the whole crew under one roof at Casa Verde. Mornings are unscheduled — beach, pool, or sleep in — and the group meets up for the dinners and the boat day on the shared itinerary. Bring reef-safe sunscreen and one nice outfit for the farewell dinner.",
    members,
    stay,
    events,
    travel,
  };
}

/**
 * Forward from the given day to the next `weekday` (0 = Sunday).
 * A fixture window always opens on its own weekday, so it never
 * reads as stale no matter when today is.
 */
function nextWeekday(fromIso: string, weekday: number): string {
  const forward =
    (weekday - new Date(`${fromIso}T12:00:00.000Z`).getUTCDay() + 7) % 7;
  return addDays(fromIso, forward);
}

/**
 * The wedding fixture: Todos Santos, twelve weeks out, opening on a
 * Saturday for three nights. Every row id is namespaced `demo-wed-`
 * so no id collides with another trip's rows (D2 — the adapter
 * resolves id-addressed writes by id alone).
 */
export function buildDemoWeddingTrip(today: Date = new Date()): DemoTrip {
  const startDate = nextWeekday(addDays(toIsoDay(today), 84), 6);
  const endDate = addDays(startDate, 3);
  const sunday = addDays(startDate, 1);
  const monday = addDays(startDate, 2);

  const members: Member[] = [
    member(`${DEMO_VIEWER_MEMBER_ID}-wed`, "You", "going", "+15550000011", false),
    member("demo-wed-dev", "Dev", "going", "+15550000012", true),
    member("demo-wed-priya", "Priya", "going", "+15550000013", false),
    member("demo-wed-marco", "Marco", "maybe", "+15550000014", false),
    member("demo-wed-liz", "Liz", "no_response", "+15550000015", false),
  ];

  const stay: Stay = {
    id: "demo-wed-stay",
    name: "Casa Marea",
    address: "Calle del Mar 8, Todos Santos, Mexico",
    addressLat: null,
    addressLon: null,
    description:
      "Gate code 7734, parking behind the house. Wifi: CasaMarea-5G / slow-dance.",
    checkIn: atClock(startDate, "15:00"),
    checkOut: atClock(endDate, "11:00"),
    image: null,
    links: [],
    deletedAt: null,
  };

  const events: ItineraryEvent[] = [
    event(
      "demo-wed-event-welcome",
      "Welcome dinner",
      "food_and_drink",
      startDate,
      "19:00",
      "21:30",
      "Casa Marea terrace",
    ),
    event(
      "demo-wed-event-ceremony",
      "Ceremony",
      "arts_and_entertainment",
      sunday,
      "16:00",
      "17:00",
      "Hacienda Garden",
    ),
    event(
      "demo-wed-event-reception",
      "Reception",
      "food_and_drink",
      sunday,
      "18:00",
      "22:00",
      "Hacienda Garden",
    ),
    event(
      "demo-wed-event-brunch",
      "Farewell brunch",
      "food_and_drink",
      monday,
      "10:00",
      "12:00",
      "Casa Marea patio",
    ),
  ];

  const travel: MockTravel[] = [
    arrival("demo-wed-travel-you", `${DEMO_VIEWER_MEMBER_ID}-wed`, "You", startDate, "10:00", "SJD T2"),
    arrival("demo-wed-travel-marco", "demo-wed-marco", "Marco", startDate, "10:20", "SJD T2"),
    arrival("demo-wed-travel-liz", "demo-wed-liz", "Liz", startDate, "10:40", "SJD T2"),
  ];

  return {
    id: DEMO_TRIP_WEDDING_ID,
    title: "Priya & Dev's wedding",
    location: "Todos Santos, Mexico",
    placeCountry: "MX",
    startDate,
    endDate,
    description:
      "Four days in Todos Santos for Priya and Dev's wedding. The group stays together at Casa Marea, the ceremony is Sunday afternoon in the hacienda garden, and Monday is a slow farewell brunch before flights home. Bring dancing shoes and something warm for the terrace evenings.",
    members,
    stay,
    events,
    travel,
  };
}

/**
 * The reunion fixture: San Diego, three weeks out, opening on a
 * Friday for two nights. Row ids are namespaced `demo-reu-` (D2).
 */
export function buildDemoReunionTrip(today: Date = new Date()): DemoTrip {
  const startDate = nextWeekday(addDays(toIsoDay(today), 21), 5);
  const endDate = addDays(startDate, 2);
  const saturday = addDays(startDate, 1);

  const members: Member[] = [
    member(`${DEMO_VIEWER_MEMBER_ID}-reu`, "You", "going", "+15550000021", false),
    member("demo-reu-rosa", "Rosa", "going", "+15550000022", true),
    member("demo-reu-eddie", "Eddie", "maybe", "+15550000023", false),
    member("demo-reu-june", "June", "no_response", "+15550000024", false),
    member("demo-reu-sam", "Sam", "going", "+15550000025", false),
  ];

  const stay: Stay = {
    id: "demo-reu-stay",
    name: "Bayview House",
    address: "Harbor Lane 4, San Diego, USA",
    addressLat: null,
    addressLon: null,
    description:
      "Door code 2290, street parking only. Wifi: BayviewHouse-5G / fish-tacos.",
    checkIn: atClock(startDate, "16:00"),
    checkOut: atClock(endDate, "11:00"),
    image: null,
    links: [],
    deletedAt: null,
  };

  const events: ItineraryEvent[] = [
    event(
      "demo-reu-event-cookout",
      "Backyard cookout",
      "food_and_drink",
      startDate,
      "18:00",
      "21:00",
      "Bayview House",
    ),
    event(
      "demo-reu-event-zoo",
      "Zoo morning",
      "outdoors",
      saturday,
      "09:30",
      "12:30",
      "Zoo front gate",
    ),
    event(
      "demo-reu-event-tacos",
      "Taco crawl",
      "food_and_drink",
      saturday,
      "19:00",
      "21:30",
      "Barrio Logan",
    ),
  ];

  const travel: MockTravel[] = [
    arrival("demo-reu-travel-you", `${DEMO_VIEWER_MEMBER_ID}-reu`, "You", startDate, "13:00", "SAN T1"),
    arrival("demo-reu-travel-eddie", "demo-reu-eddie", "Eddie", startDate, "13:20", "SAN T1"),
    arrival("demo-reu-travel-june", "demo-reu-june", "June", startDate, "13:40", "SAN T1"),
  ];

  return {
    id: DEMO_TRIP_REUNION_ID,
    title: "San Diego reunion",
    location: "San Diego, USA",
    placeCountry: "US",
    startDate,
    endDate,
    description:
      "A long weekend in San Diego with the whole extended family at the Bayview House. Friday is a backyard cookout, Saturday is the zoo by day and a taco crawl by night, and Sunday is checkout and slow goodbyes. Bring a jacket for the bay breeze.",
    members,
    stay,
    events,
    travel,
  };
}

/**
 * All three fixtures in the landing's pinned card order (bachelor,
 * wedding, reunion), each derived from the given today.
 */
export function buildDemoTrips(today: Date = new Date()): DemoTrip[] {
  return [buildDemoTrip(today), buildDemoWeddingTrip(today), buildDemoReunionTrip(today)];
}

/** The deep link a shelf card opens for its trip. */
export function demoHrefFor(tripId: string): string {
  return `/demo?id=${tripId}`;
}

/**
 * One entry per shelf card, in the pinned order, carrying exactly
 * what the card needs. Pure — no store, no clock beyond the passed
 * today — so the landing and its tests share it. The `coverKind`
 * strings become `PlaceholderKind`s when the occasion kinds land
 * (Phase 4); until then they only need to be distinct.
 */
export type DemoTripCard = {
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  occasion: "bachelor" | "wedding" | "reunion";
  coverKind: string;
  href: string;
};

export function demoTripCards(today: Date = new Date()): DemoTripCard[] {
  const occasions = ["bachelor", "wedding", "reunion"] as const;
  return buildDemoTrips(today).map((trip, index) => ({
    id: trip.id,
    title: trip.title,
    location: trip.location,
    startDate: trip.startDate,
    endDate: trip.endDate,
    occasion: occasions[index]!,
    coverKind: occasions[index]!,
    href: demoHrefFor(trip.id),
  }));
}
