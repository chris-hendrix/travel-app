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
 * so the trip never reads as stale. The landing's captured image
 * freezes whatever this said: re-capture when this shape changes.
 */
export type DemoTrip = {
  /** The adapter's key: the id the real `GET /trips/:id` reads serve. */
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  /** The friend's view: the demo reads as the traveler, not the organizer. */
  viewerMemberId: string;
  members: Member[];
  stay: Stay;
  events: ItineraryEvent[];
  travel: MockTravel[];
};

/** The viewer's own row. The RSVP control and the roster row share it. */
export const DEMO_VIEWER_MEMBER_ID = "demo-you";

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
  return {
    id,
    userId: id === DEMO_VIEWER_MEMBER_ID ? "demo-viewer" : `demo-user-${id}`,
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
    id: "demo-trip-cabo",
    title: "Cabo",
    location: "Cabo San Lucas, Mexico",
    startDate,
    endDate,
    viewerMemberId: DEMO_VIEWER_MEMBER_ID,
    members,
    stay,
    events,
    travel,
  };
}

/** What the demo screen reads: the fixture derived from the real today. */
export function getDemoTrip(): DemoTrip {
  return buildDemoTrip(new Date());
}

/**
 * The demo list: the Cabo trip first, then up to two wholly invented
 * trips so the real trip list reads as a list. The landing's demo link
 * depends on Cabo being first; the others exist only so the list has
 * more than one row and the groupings (upcoming, past) have something
 * to show. Every privacy rule holds for all three: reserved 555
 * numbers only, invented names, bundled PlaceholderImage kinds (every
 * image slot null), no remote URL, dates derived from today. The
 * viewer rides every roster as the same `demo-viewer` account with
 * status `going`, so `viewerOf` resolves and `canReadRun` opens the
 * run on whichever trip the visitor taps.
 */
export function buildDemoTrips(today: Date = new Date()): DemoTrip[] {
  const cabo = buildDemoTrip(today);
  const caboStart = new Date(`${cabo.startDate}T12:00:00.000Z`);

  // A nearer upcoming weekend: two weeks before Cabo opens, Fri–Sun.
  const marfaStart = toIsoDay(
    new Date(caboStart.getTime() - 14 * 86_400_000),
  );
  const marfaEnd = addDays(marfaStart, 2);
  const marfaSaturday = addDays(marfaStart, 1);
  const marfa: DemoTrip = {
    id: "demo-trip-marfa",
    title: "Marfa",
    location: "Marfa, Texas",
    startDate: marfaStart,
    endDate: marfaEnd,
    viewerMemberId: DEMO_VIEWER_MEMBER_ID,
    members: [
      member(DEMO_VIEWER_MEMBER_ID, "You", "going", "+15550000011", false),
      member("demo-june", "June", "going", "+15550000012", true),
      member("demo-theo", "Theo", "maybe", "+15550000013", false),
    ],
    stay: {
      id: "demo-stay-marfa",
      name: "El Cosmico",
      address: "Shorthorn Street, Marfa, Texas",
      addressLat: null,
      addressLon: null,
      description: "Two yurts and a trailer. Check in at the lobby tent.",
      checkIn: atClock(marfaStart, "15:00"),
      checkOut: atClock(marfaEnd, "11:00"),
      image: null,
      links: [],
      deletedAt: null,
    },
    events: [
      event(
        "demo-event-marfa-lights",
        "Marfa lights",
        "outdoors",
        marfaStart,
        "21:00",
        "23:00",
        "Lights viewing area",
      ),
      event(
        "demo-event-marfa-prada",
        "Prada Marfa",
        "arts_and_entertainment",
        marfaSaturday,
        "10:00",
        "12:00",
        "Highway 90",
      ),
    ],
    travel: [
      arrival(
        "demo-travel-marfa-you",
        DEMO_VIEWER_MEMBER_ID,
        "You",
        marfaStart,
        "13:00",
        "MRF",
      ),
      arrival(
        "demo-travel-marfa-june",
        "demo-june",
        "June",
        marfaStart,
        "13:20",
        "MRF",
      ),
    ],
  };

  // A past trip, seventeen weeks before Cabo opens, Fri–Mon: the list's
  // past section has a row, and a tapped past trip still reads its run.
  const portlandStart = toIsoDay(
    new Date(caboStart.getTime() - 119 * 86_400_000),
  );
  const portlandEnd = addDays(portlandStart, 3);
  const portlandSaturday = addDays(portlandStart, 1);
  const portland: DemoTrip = {
    id: "demo-trip-portland",
    title: "Portland",
    location: "Portland, Oregon",
    startDate: portlandStart,
    endDate: portlandEnd,
    viewerMemberId: DEMO_VIEWER_MEMBER_ID,
    members: [
      member(DEMO_VIEWER_MEMBER_ID, "You", "going", "+15550000011", false),
      member("demo-ana", "Ana", "going", "+15550000022", true),
    ],
    stay: {
      id: "demo-stay-portland",
      name: "Jupiter Hotel",
      address: "Burnside Street, Portland, Oregon",
      addressLat: null,
      addressLon: null,
      description: "Corner rooms when we ask early.",
      checkIn: atClock(portlandStart, "16:00"),
      checkOut: atClock(portlandEnd, "11:00"),
      image: null,
      links: [],
      deletedAt: null,
    },
    events: [
      event(
        "demo-event-portland-powells",
        "Powell's run",
        "shopping",
        portlandSaturday,
        "10:00",
        "12:00",
        "Powell's Books",
      ),
      event(
        "demo-event-portland-carts",
        "Cart dinner",
        "food_and_drink",
        portlandSaturday,
        "18:00",
        "20:00",
        "Cart blocks",
      ),
    ],
    travel: [
      arrival(
        "demo-travel-portland-you",
        DEMO_VIEWER_MEMBER_ID,
        "You",
        portlandStart,
        "09:00",
        "PDX T2",
      ),
      arrival(
        "demo-travel-portland-ana",
        "demo-ana",
        "Ana",
        portlandStart,
        "09:20",
        "PDX T2",
      ),
    ],
  };

  return [cabo, marfa, portland];
}
