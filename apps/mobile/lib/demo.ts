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
  /** The trip's ledger: what the Settle sheet's three reads are computed from. */
  payments: DemoPayment[];
};

/**
 * One expense in a trip's ledger, in the fixture's own shorthand.
 *
 * The shares are deliberately **not** written down here: they are the
 * server's own rule (`PaymentService.computeEqualShares`, mirrored by
 * `splitPreview`), and `lib/demo/adapter.ts` applies it when it builds
 * the row. So a fixture row cannot state shares that disagree with its
 * own amount, and every balance the demo serves is arithmetic over
 * these rows rather than a number written beside them.
 *
 * A trip's ledger is invisible unless it is split across more than one
 * person: the balance service credits the payer and debits each
 * participant, and the simplifier drops a zero, so a ledger whose only
 * member is the reader nets to exactly nothing and the sheet has no row
 * to draw at all. Every trip below therefore involves several members,
 * and each carries one **guest** — a member row with no account behind
 * it, which the API allows as a payer and as a participant and the app
 * must not hide.
 */
export type DemoPayment = {
  id: string;
  description: string;
  /** "how was it paid" — null when unset, which is different from "". */
  note: string | null;
  /** The whole expense, in integer cents. */
  amount: number;
  /** Who paid: a **member** id. */
  payerMemberId: string;
  /**
   * Everyone splitting it, in the order the remainder cents are handed
   * out: **member** ids, and the order is load-bearing — the first
   * `amount % count` people in this list get one cent more than the
   * rest (`splitPreview`).
   */
  participants: string[];
  /**
   * Who filed it: a **user** id (`userIdOf`), which is a different space
   * from the two above — `createdBy` matches a `member.userId` and never
   * a `member.id`, and the detail's Edit predicate is exactly that
   * comparison.
   */
  createdBy: string;
  /** Noon-anchored, and inside the trip's own window (`atClock`). */
  date: string;
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

/**
 * The **user** id behind a member row: the account the row belongs to.
 *
 * Two id spaces meet here and are never interchangeable. This returns a
 * user id — what `payments.createdBy` holds — while `payerMemberId` and
 * every `participants[].memberId` are **member** ids. Crossing them is
 * what makes an Edit button appear on somebody else's row. The viewer's
 * user id is `DEMO_AUTH_USER.id`, the account the demo signs in as.
 *
 * Each trip carries the viewer's own row under its own id (row ids are
 * globally unique per D2) and all of them resolve to the same demo user,
 * which is what the RSVP path keys on — hence the prefix test.
 */
function userIdOf(memberId: string): string {
  const isViewer =
    memberId === DEMO_VIEWER_MEMBER_ID ||
    memberId.startsWith(`${DEMO_VIEWER_MEMBER_ID}-`);
  return isViewer ? DEMO_AUTH_USER.id : `demo-user-${memberId}`;
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
    userId: userIdOf(id),
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

/**
 * A guest on the trip: a member row with no account behind it, which is
 * what the roster's far column reads as "Guest" and what the expense
 * dialogs join onto a payer's name.
 *
 * The number is empty on purpose. A guest is invited by phone, but the
 * number is the organizer's to see (`guestPhone` comes back only to
 * them), a guest with no number is a row the API's own flow creates, and
 * the demo viewer is never an organizer — so a number here would be a
 * fact the real API would not have handed this reader.
 */
function guest(id: string, name: string): Member {
  return {
    id,
    userId: null,
    name,
    status: "going",
    isOrganizer: false,
    phone: "",
    sharePhone: false,
    handles: null,
  };
}

/**
 * One ledger row. The shares are not a parameter: the adapter derives
 * them from `amount` and `participants` with the server's own rule (see
 * `DemoPayment`), so this can only ever state the payer, the people and
 * the total.
 */
function payment(
  id: string,
  description: string,
  note: string | null,
  amount: number,
  payerMemberId: string,
  participants: string[],
  /** A day inside the trip's window; the row is stamped at local noon on it. */
  dayIso: string,
  /** A **user** id — `userIdOf(memberId)`, never the member id itself. */
  createdBy: string,
): DemoPayment {
  return {
    id,
    description,
    note,
    amount,
    payerMemberId,
    participants,
    createdBy,
    date: atClock(dayIso, "12:00"),
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
    // The ledger's second payer, and the trip's guest: Nina is on the
    // trip without an account behind her row. She paid for the groceries
    // the group landed on, which is the shape the API allows — a guest
    // as a payer — and the shape the roster's far column prints.
    guest("demo-guest-cabo", "Nina"),
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

  // The ledger, dated on the days the itinerary already runs: the boat
  // deposit on the boat day, the tacos on the tacos night, and a
  // settlement two days in. Two rows carry a note and three do not,
  // because the sheet drops an absent note rather than printing a blank
  // one; one row is a settlement (a payment whose only participant is
  // somebody other than the payer), which is the row the sheet reads as
  // "Settled up"; and the tacos are deliberately $50.00 across three
  // people, where the remainder is 2 — the only kind of row that tells
  // the two readings of the split rule apart ([1667, 1667, 1666], one
  // cent each to the first two, not [1668, 1666, 1666]).
  const payments: DemoPayment[] = [
    payment(
      "demo-payment-boat",
      "Boat day",
      "Paid by card",
      48000,
      "demo-sam",
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-marco", "demo-sam"],
      sunday,
      userIdOf("demo-sam"),
    ),
    // A guest paid, and the viewer is the one who filed it — so this row
    // is one the viewer may edit without being its payer.
    payment(
      "demo-payment-groceries",
      "Groceries at the house",
      null,
      15750,
      "demo-guest-cabo",
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-marco", "demo-sam"],
      startDate,
      userIdOf(DEMO_VIEWER_MEMBER_ID),
    ),
    payment(
      "demo-payment-tacos",
      "Tacos in town",
      null,
      5000,
      "demo-liz",
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-sam"],
      saturday,
      userIdOf("demo-liz"),
    ),
    payment(
      "demo-payment-drinks",
      "Sunset drinks",
      "Venmo",
      9600,
      DEMO_VIEWER_MEMBER_ID,
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-marco"],
      saturday,
      userIdOf(DEMO_VIEWER_MEMBER_ID),
    ),
    payment(
      "demo-payment-settled",
      "Settled up",
      null,
      7500,
      "demo-marco",
      [DEMO_VIEWER_MEMBER_ID],
      monday,
      userIdOf("demo-marco"),
    ),
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
    payments,
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
    // The wedding's guest, and a share of the taxis she rode in.
    guest("demo-wed-guest", "Rosa"),
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

  // Dev fronted the dinner and the four of them settle the rest between
  // them, which is what makes the moves read as people rather than as a
  // single tab. The taxis carry the guest, and one row is a settlement
  // (Liz's only participant is the viewer) so the sheet shows a
  // "Settled up" entry here too.
  const payments: DemoPayment[] = [
    payment(
      "demo-wed-payment-welcome",
      "Welcome dinner",
      "Paid by card",
      24600,
      "demo-wed-dev",
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-dev",
        "demo-wed-priya",
        "demo-wed-marco",
        "demo-wed-liz",
      ],
      startDate,
      userIdOf("demo-wed-dev"),
    ),
    payment(
      "demo-wed-payment-groceries",
      "Casa Marea groceries",
      null,
      9020,
      `${DEMO_VIEWER_MEMBER_ID}-wed`,
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-dev",
        "demo-wed-priya",
        "demo-wed-marco",
      ],
      startDate,
      userIdOf(`${DEMO_VIEWER_MEMBER_ID}-wed`),
    ),
    payment(
      "demo-wed-payment-taxis",
      "Airport taxis",
      null,
      7000,
      "demo-wed-marco",
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-marco",
        "demo-wed-liz",
        "demo-wed-guest",
      ],
      startDate,
      userIdOf("demo-wed-marco"),
    ),
    payment(
      "demo-wed-payment-brunch",
      "Farewell brunch",
      "Venmo",
      11900,
      "demo-wed-priya",
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-dev",
        "demo-wed-priya",
        "demo-wed-liz",
      ],
      monday,
      userIdOf("demo-wed-priya"),
    ),
    payment(
      "demo-wed-payment-settled",
      "Settled up",
      null,
      2000,
      "demo-wed-liz",
      [`${DEMO_VIEWER_MEMBER_ID}-wed`],
      monday,
      userIdOf("demo-wed-liz"),
    ),
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
    payments,
  };
}

/**
 * The bachelor fixture: San Diego, three weeks out, opening on a Friday
 * for two nights. Row ids are namespaced `demo-bach-` (D2).
 *
 * It is Dev's, and Marco is the best man organizing it, so the names that
 * recur across the three demos belong to one friend group — Dev and Marco
 * are on the wedding trip too. What recurs is the *reading*, not the
 * account: `member()` derives `userId` from the row id (D2 wants globally
 * unique rows), so `demo-wed-dev` and `demo-bach-dev` are two people who
 * happen to share a name rather than one shared row. The groom is the one
 * member who cannot be the organizer.
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
    // The bachelor party's guest, and a share of the steak dinner.
    guest("demo-bach-guest", "Danny"),
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

  // Marco booked the tickets, Eddie got the table, and everyone else
  // carried a piece — the ledger is a party splitting a weekend rather
  // than one person's tab. The steak dinner is deliberately $227.10
  // across six, so its shares are even (3785 each) and the guest Danny
  // holds a real share of the trip.
  const payments: DemoPayment[] = [
    payment(
      "demo-bach-payment-groceries",
      "House groceries",
      null,
      11220,
      `${DEMO_VIEWER_MEMBER_ID}-bac`,
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
      ],
      startDate,
      userIdOf(`${DEMO_VIEWER_MEMBER_ID}-bac`),
    ),
    payment(
      "demo-bach-payment-tickets",
      "Padres game tickets",
      "Paid by card",
      33600,
      "demo-bach-marco",
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
        "demo-bach-eddie",
      ],
      saturday,
      userIdOf("demo-bach-marco"),
    ),
    payment(
      "demo-bach-payment-steak",
      "Steak dinner",
      null,
      22710,
      "demo-bach-eddie",
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
        "demo-bach-eddie",
        "demo-bach-guest",
      ],
      saturday,
      userIdOf("demo-bach-eddie"),
    ),
    payment(
      "demo-bach-payment-surf",
      "Surf lesson",
      "Venmo",
      16000,
      "demo-bach-dev",
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
      ],
      saturday,
      userIdOf("demo-bach-dev"),
    ),
    payment(
      "demo-bach-payment-settled",
      "Settled up",
      null,
      5000,
      "demo-bach-sam",
      [`${DEMO_VIEWER_MEMBER_ID}-bac`],
      sunday,
      userIdOf("demo-bach-sam"),
    ),
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
    payments,
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
