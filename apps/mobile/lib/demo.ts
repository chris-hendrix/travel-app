import type { ItineraryEvent } from "@/lib/itinerary";
import type { Member } from "@/lib/members";
import type { OccasionKind } from "@/lib/placeholder";
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
 * One more, since the places became real: a venue on an event is a real,
 * findable place in that trip's own city, and only a rental — which has
 * no Maps listing to be real — carries an invented name and address.
 * Nothing here is a photograph of a named business, and nothing here is
 * a URL; see `lib/placeholder.ts` for why no bundled photo can be one.
 *
 * Dates and times are written on the viewer's own wall clock, so the
 * demo needs no timezone (see `toIsoDay`). The trip never reads as stale
 * because each one's window is derived from today and forwards to its
 * own weekday. The landing renders the three as cards and reads them
 * live, so a shape change shows up there directly — no capture to
 * re-take.
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

/** The bachelor party's id: the landing's third `/demo?id=…` link carries it. */
export const DEMO_TRIP_BACHELOR_ID = "demo-trip-bachelor";

/**
 * Every demo trip's id, in the landing's pinned card order (beach,
 * wedding, bachelor). The early install, the guard and the card
 * selector all read this set, so a fourth trip cannot sneak in
 * through one door but not the others.
 */
export const DEMO_TRIP_IDS = [
  DEMO_TRIP_ID,
  DEMO_TRIP_WEDDING_ID,
  DEMO_TRIP_BACHELOR_ID,
] as const;

/** The demo session: the anonymous visitor reads as this traveler. */
export const DEMO_AUTH_USER = {
  id: "demo-viewer",
  phoneNumber: "+15550000001",
  displayName: "You",
  profileComplete: true,
} as const;

/**
 * The whole fixture is built on the **viewer's own wall clock**, and that
 * is what lets the demo carry no timezone at all. A demo trip has no real
 * zone, so its times are written in the reader's: a 19:00 dinner reads
 * 7:00 PM in New York and in Lisbon alike, rather than being pinned to
 * whatever offset the fixture happened to be built in. `wallClock`
 * (`lib/timezone.ts`) already falls back to the device clock for a falsy
 * zone, and `detailOf` (`lib/demo/adapter.ts`) leaves
 * `preferredTimezone` empty to match, so both halves agree.
 */
function toIsoDay(moment: Date): string {
  const month = `${moment.getMonth() + 1}`.padStart(2, "0");
  const day = `${moment.getDate()}`.padStart(2, "0");
  return `${moment.getFullYear()}-${month}-${day}`;
}

/** Local noon, so a day never moves under a DST boundary at either end. */
function dayMoment(dayIso: string): Date {
  return new Date(`${dayIso}T12:00:00`);
}

function addDays(dayIso: string, days: number): string {
  const moment = dayMoment(dayIso);
  moment.setDate(moment.getDate() + days);
  return toIsoDay(moment);
}

/**
 * A wall clock on a day, as the instant it names *in the viewer's own
 * zone*: `new Date("…T19:00:00")` with no trailing `Z` is parsed as
 * local time, which is what makes a 19:00 dinner read back as 7:00 PM
 * rather than as 3:00 PM in New York. `lib/newEvent.ts` stamps a real
 * event the same way, off the trip's own zone — there is no trip zone
 * here to read it off, which is the whole point of the demo.
 */
function atClock(dayIso: string, clock: string): string {
  return new Date(`${dayIso}T${clock}:00`).toISOString();
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
  /** The user's own label for the row: what the itinerary tile prints. */
  label: string,
  /**
   * The place behind that label. Two columns rather than one because the
   * app keeps them apart on purpose — the label is what the organizer
   * typed, the snapshot is what they picked — and the demo shows both.
   *
   * Every value here is a real, findable place (see `DEMO_PLACES` in
   * `lib/demo/adapter.ts`), except where the event is at the trip's own
   * rental, which has no Maps listing to be real: those reuse the stay's
   * invented name and address, which is exactly the typed-text case.
   */
  picked: { name: string; address: string },
): ItineraryEvent {
  return {
    id,
    name,
    type,
    description: null,
    startTime: clock ? atClock(dayIso, clock) : atClock(dayIso, "09:00"),
    endTime: endClock ? atClock(dayIso, endClock) : null,
    allDay: clock === null,
    place: label,
    placeName: picked.name,
    placeAddress: picked.address,
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
  const forward = (5 - dayMoment(friday).getDay() + 7) % 7;
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
    // A rental house is the one place on a demo itinerary that cannot be
    // a real, findable place: nobody lists their holiday let on Maps, and
    // the door code below is the whole reason the stay screen exists. So
    // this name and address are invented, and the two events held at the
    // house reuse them — which is exactly the typed-text case the app
    // supports, and the only invented places left in the fixture.
    placeName: "Casa Verde",
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

  // Every place here is a real, findable one in Cabo San Lucas — the same
  // rows `DEMO_PLACES` offers the picker, so what the itinerary shows and
  // what the picker suggests cannot drift apart. The exceptions are the
  // two at the house, which reuse the rental's invented name and address.
  const events: ItineraryEvent[] = [
    event(
      "demo-event-tacos",
      "Tacos in town",
      "food_and_drink",
      saturday,
      "19:00",
      "21:00",
      "Taquería El Paisa",
      {
        name: "Taquería El Paisa",
        address: "Boulevard Lázaro Cárdenas, Cabo San Lucas, BCS, Mexico",
      },
    ),
    event(
      "demo-event-sunset",
      "Sunset drinks",
      "nightlife",
      saturday,
      "21:30",
      "23:00",
      "The Rooftop 360",
      {
        name: "The Rooftop 360",
        address: "Corazón Cabo, Cabo San Lucas, BCS, Mexico",
      },
    ),
    event(
      "demo-event-boat",
      "Boat day",
      "outdoors",
      sunday,
      "09:00",
      "13:00",
      "Marina Cabo San Lucas",
      {
        name: "Marina Cabo San Lucas",
        address: "Blvd. Marina, Cabo San Lucas, BCS, Mexico",
      },
    ),
    event(
      "demo-event-beach",
      "Beach afternoon",
      "outdoors",
      sunday,
      "14:00",
      "17:00",
      "Playa El Médano",
      {
        name: "Playa El Médano",
        address: "Playa El Médano, Cabo San Lucas, BCS, Mexico",
      },
    ),
    event(
      "demo-event-dinner",
      "Dinner at the house",
      "food_and_drink",
      sunday,
      "19:30",
      "21:30",
      "Casa Verde grill",
      {
        name: "Casa Verde",
        address: "Calle del Sol 12, Cabo San Lucas, Mexico",
      },
    ),
    event(
      "demo-event-beachday",
      "Beach day",
      "outdoors",
      monday,
      null,
      null,
      "Playa Santa María",
      {
        name: "Playa Santa María",
        address: "Playa Santa María, Cabo San Lucas, BCS, Mexico",
      },
    ),
    event(
      "demo-event-farewell",
      "Farewell dinner",
      "food_and_drink",
      monday,
      "19:00",
      "21:00",
      "Solomon's Landing",
      {
        name: "Solomon's Landing",
        address: "Blvd. Paseo de la Marina, Cabo San Lucas, BCS, Mexico",
      },
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
    (weekday - dayMoment(fromIso).getDay() + 7) % 7;
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
    // Invented, like every rental in this file: a holiday let has no Maps
    // listing, and the gate code below is why the stay screen exists.
    placeName: "Casa Marea",
    description:
      "Gate code 7734, parking behind the house. Wifi: CasaMarea-5G / slow-dance.",
    checkIn: atClock(startDate, "15:00"),
    checkOut: atClock(endDate, "11:00"),
    image: null,
    links: [],
    deletedAt: null,
  };

  // The ceremony and the reception are one real venue — a hacienda in the
  // middle of Todos Santos, which is what "Hacienda garden" was standing
  // in for. The two meals at the house reuse the rental's invented name.
  const events: ItineraryEvent[] = [
    event(
      "demo-wed-event-welcome",
      "Welcome dinner",
      "food_and_drink",
      startDate,
      "19:00",
      "21:30",
      "Cien Palmas",
      {
        name: "Cien Palmas",
        address: "Centro, Todos Santos, BCS, Mexico",
      },
    ),
    event(
      "demo-wed-event-ceremony",
      "Ceremony",
      "arts_and_entertainment",
      sunday,
      "16:00",
      "17:00",
      "Hacienda garden",
      {
        name: "Hotel Hacienda Todos Los Santos",
        address: "Benito Juárez, Todos Santos, BCS, Mexico",
      },
    ),
    event(
      "demo-wed-event-reception",
      "Reception",
      "food_and_drink",
      sunday,
      "18:00",
      "22:00",
      "Hacienda garden",
      {
        name: "Hotel Hacienda Todos Los Santos",
        address: "Benito Juárez, Todos Santos, BCS, Mexico",
      },
    ),
    event(
      "demo-wed-event-brunch",
      "Farewell brunch",
      "food_and_drink",
      monday,
      "10:00",
      "12:00",
      "Casa Marea patio",
      {
        name: "Casa Marea",
        address: "Calle del Mar 8, Todos Santos, Mexico",
      },
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
 * The bachelor fixture: San Diego, three weeks out, opening on a Friday
 * for two nights. Row ids are namespaced `demo-bach-` (D2).
 *
 * It is Dev's, and Marco is the best man organizing it — the same Dev
 * and Marco who appear on the wedding trip, which is the point: the three
 * demos read as one friend group's year rather than as three unrelated
 * samples. The groom is the one member who cannot be the organizer.
 */
export function buildDemoBachelorTrip(today: Date = new Date()): DemoTrip {
  const startDate = nextWeekday(addDays(toIsoDay(today), 21), 5);
  const endDate = addDays(startDate, 2);
  const saturday = addDays(startDate, 1);
  const sunday = addDays(startDate, 2);

  const members: Member[] = [
    member(`${DEMO_VIEWER_MEMBER_ID}-bac`, "You", "going", "+15550000031", false),
    member("demo-bach-dev", "Dev", "going", "+15550000032", false),
    member("demo-bach-marco", "Marco", "going", "+15550000033", true),
    member("demo-bach-sam", "Sam", "maybe", "+15550000034", false),
    member("demo-bach-eddie", "Eddie", "no_response", "+15550000035", false),
  ];

  const stay: Stay = {
    id: "demo-bach-stay",
    name: "Wavecrest",
    address: "Ocean Front Walk, Pacific Beach, San Diego, USA",
    addressLat: null,
    addressLon: null,
    // Invented, like every rental in this file. The two events held here
    // reuse the name and the address, which is the typed-text case.
    placeName: "Wavecrest",
    description:
      "Door code 4417, lockbox by the garage. Wifi: Wavecrest-5G / paddle-out.",
    checkIn: atClock(startDate, "16:00"),
    checkOut: atClock(endDate, "11:00"),
    image: null,
    links: [],
    deletedAt: null,
  };

  // A bachelor party is a day of one thing after another, which is what
  // makes it worth showing: every place is a real one you could go to,
  // and only the two at the house are the rental's own invented name.
  const events: ItineraryEvent[] = [
    event(
      "demo-bach-event-cookout",
      "Backyard cookout",
      "food_and_drink",
      startDate,
      "18:00",
      "21:00",
      "Wavecrest",
      {
        name: "Wavecrest",
        address: "Ocean Front Walk, Pacific Beach, San Diego, USA",
      },
    ),
    event(
      "demo-bach-event-surf",
      "Surf lesson",
      "outdoors",
      saturday,
      "10:00",
      "12:00",
      "Pacific Beach",
      {
        name: "Pacific Beach",
        address: "Pacific Beach, San Diego, CA, USA",
      },
    ),
    event(
      "demo-bach-event-ballgame",
      "Padres game",
      "arts_and_entertainment",
      saturday,
      "13:00",
      "16:00",
      "Petco Park",
      {
        name: "Petco Park",
        address: "100 Park Blvd, San Diego, CA, USA",
      },
    ),
    event(
      "demo-bach-event-steak",
      "Steak dinner",
      "food_and_drink",
      saturday,
      "19:00",
      "21:00",
      "Greystone Steakhouse",
      {
        name: "Greystone Steakhouse",
        address: "658 5th Ave, San Diego, CA, USA",
      },
    ),
    event(
      "demo-bach-event-piano",
      "Piano bar",
      "nightlife",
      saturday,
      "21:30",
      "23:30",
      "The Shout! House",
      {
        name: "The Shout! House",
        address: "655 4th Ave, San Diego, CA, USA",
      },
    ),
    event(
      "demo-bach-event-brunch",
      "Farewell brunch",
      "food_and_drink",
      sunday,
      "11:30",
      "13:00",
      "Wavecrest",
      {
        name: "Wavecrest",
        address: "Ocean Front Walk, Pacific Beach, San Diego, USA",
      },
    ),
  ];

  // Four of the five land twenty minutes apart. Eddie has shared nothing
  // yet, so he reads as owed at the foot of the board rather than missing
  // from it — the same shape Cabo has with Priya.
  const travel: MockTravel[] = [
    arrival("demo-bach-travel-you", `${DEMO_VIEWER_MEMBER_ID}-bac`, "You", startDate, "12:40", "SAN T1"),
    arrival("demo-bach-travel-dev", "demo-bach-dev", "Dev", startDate, "13:00", "SAN T1"),
    arrival("demo-bach-travel-marco", "demo-bach-marco", "Marco", startDate, "13:20", "SAN T1"),
    arrival("demo-bach-travel-sam", "demo-bach-sam", "Sam", startDate, "13:40", "SAN T1"),
  ];

  return {
    id: DEMO_TRIP_BACHELOR_ID,
    title: "Dev's bachelor party",
    location: "San Diego, USA",
    placeCountry: "US",
    startDate,
    endDate,
    description:
      "Two nights in Pacific Beach for Dev's last weekend before the wedding. Friday is a cookout at the house, Saturday runs surf lesson, Padres game, steak, piano bar, and Sunday is brunch before the airport. Bring a jacket — the marine layer does not care that it is July.",
    members,
    stay,
    events,
    travel,
  };
}

/**
 * All three fixtures in the landing's pinned card order (beach, wedding,
 * bachelor), each derived from the given today.
 */
export function buildDemoTrips(today: Date = new Date()): DemoTrip[] {
  return [buildDemoTrip(today), buildDemoWeddingTrip(today), buildDemoBachelorTrip(today)];
}

/** The deep link a shelf card opens for its trip. */
export function demoHrefFor(tripId: string): string {
  return `/demo?id=${tripId}`;
}

/**
 * The three cards' occasions, in the pinned card order (D4).
 *
 * One list, read by the landing's cards, by the trip page's own cover
 * (`demoCoverKind`) and by the tests, so a card and the page it opens
 * cannot end up showing different photos.
 */
const OCCASIONS: readonly OccasionKind[] = ["beach", "wedding", "bachelor"];

/**
 * The cover a demo trip's own page wears, by trip id.
 *
 * The shelf's card and the trip page's hero are two renderings of one
 * photo, so both read this list: `app/demo.tsx` hands the result to
 * `TripDetail`'s `coverKind`, which is the same seam `TripCard` already
 * has. Null for an id that is not one of the three, which is the hero's
 * own `"trip"` default — a demo link to nothing gets the generic photo
 * rather than a wrong one.
 */
export function demoCoverKind(tripId: string): OccasionKind | null {
  const index = DEMO_TRIP_IDS.findIndex((id) => id === tripId);
  return index < 0 ? null : OCCASIONS[index]!;
}

/**
 * One entry per shelf card, in the pinned order, carrying exactly
 * what the card needs. Pure — no store, no clock beyond the passed
 * today — so the landing and its tests share it.
 *
 * `occasion` is the semantic label; `coverKind` is the image slot, and
 * they name the same three values today, so the hand-off to `TripCard`
 * is the shelf's (Task 15) and this module never touches an asset.
 * A type-only import, so no photo is pulled into the fixture's graph.
 */
export type DemoTripCard = {
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  /** The trip's own roster size, which the card does not draw today. */
  going: number;
  occasion: OccasionKind;
  coverKind: OccasionKind;
  href: string;
};

export function demoTripCards(today: Date = new Date()): DemoTripCard[] {
  return buildDemoTrips(today).map((trip, index) => ({
    id: trip.id,
    title: trip.title,
    location: trip.location,
    startDate: trip.startDate,
    endDate: trip.endDate,
    going: trip.members.length,
    occasion: OCCASIONS[index]!,
    coverKind: OCCASIONS[index]!,
    href: demoHrefFor(trip.id),
  }));
}
