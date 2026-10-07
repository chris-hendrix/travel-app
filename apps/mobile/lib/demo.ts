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
  /** The friend's view: the demo reads as the traveler, not the organizer. */
  viewerMemberId: string;
  members: Member[];
  stay: Stay;
  events: ItineraryEvent[];
  travel: MockTravel[];
};

/** The viewer's own row. The RSVP control and the roster row share it. */
export const DEMO_VIEWER_MEMBER_ID = "demo-you";

/** The demo trip's id: the landing band's `/demo?id=…` link carries it. */
export const DEMO_TRIP_ID = "demo-trip-cabo";

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
    id: DEMO_TRIP_ID,
    title: "Cabo",
    location: "Cabo San Lucas, Mexico",
    startDate,
    endDate,
    description:
      "Five days in Cabo San Lucas with the whole crew under one roof at Casa Verde. Mornings are unscheduled — beach, pool, or sleep in — and the group meets up for the dinners and the boat day on the shared itinerary. Bring reef-safe sunscreen and one nice outfit for the farewell dinner.",
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
