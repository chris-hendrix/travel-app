import { daysBetween } from "@/lib/countdown";
import { formatDaySpan } from "@/lib/dateRange";
import { wallClock } from "@/lib/timezone";

/** A link out of a stay: the listing, the directions, the house rules. */
export type StayLink = { url: string; name: string };

/**
 * Where the group sleeps, as the run needs it.
 *
 * Shaped after the API's row, because that is what this will be wired
 * to: a name, an address (and the pair of coordinates the API's
 * geocoding fills in), a description, two times, and a list of links.
 *
 * The description is doing more work here than it does on an event. The
 * way in — the code, the lockbox, the wifi — has no column of its own,
 * so it lives in that prose, which makes the description the block
 * everybody opens the screen for rather than the note at the bottom.
 *
 * `links` is carried but not shown. The sheet is the arrival screen —
 * the address, the way in, the times — and a list of links at the foot
 * of it is the booking record rather than something to read at a door.
 * Kept on the type because the column is there and an edit has to hand
 * whatever was in it back.
 *
 * `image` is the one field the row does not have: it is the place's
 * photo, which the API proxies from Google Places.
 */
export type Stay = {
  id: string;
  name: string;
  address: string | null;
  /** What Maps would take, once the API's geocoding fills them in. */
  addressLat: number | null;
  addressLon: number | null;
  /** The organizer's prose. Where the wifi and the door code live. */
  description: string | null;
  checkIn: string | null;
  checkOut: string | null;
  /** The place's photo, which the API proxies from Places. */
  image: string;
  links: StayLink[];
  /** The API's soft delete. Null while it is live. */
  deletedAt: string | null;
};

/** The day a stay starts, in the zone its times are read in. */
export function stayStart(stay: Stay, timeZone: string | null): string | null {
  return stay.checkIn ? wallClock(stay.checkIn, timeZone).date : null;
}

/** The day it ends. */
export function stayEnd(stay: Stay, timeZone: string | null): string | null {
  return stay.checkOut ? wallClock(stay.checkOut, timeZone).date : null;
}

/**
 * The clock on a stay, or nothing when nobody said one.
 *
 * Midnight is how a day without a time is stamped — the column wants a
 * timestamp and "nobody said" is not one — so a midnight prints as no
 * clock at all rather than as 12:00 AM. The same bargain an all-day
 * event makes, for the same reason: an invented 12:00 AM is a fact
 * somebody would act on. A friend's spare room has no check-in time, and
 * this is what says so; a host who really does mean midnight can say it
 * in the description, which is where the rest of the way in lives.
 */
export function stayTime(
  iso: string | null,
  timeZone: string | null,
): string | null {
  if (!iso) return null;
  const { clock, time } = wallClock(iso, timeZone);
  return clock === "00:00" ? null : time;
}

/**
 * The run's range column: "Sep 17–23".
 *
 * Null when nothing said when, because a stay whose dates nobody filled
 * in has no span to print and the row is quieter for saying nothing.
 */
export function staySpan(stay: Stay, timeZone: string | null): string | null {
  const start = stayStart(stay, timeZone);
  if (!start) return null;
  return formatDaySpan(start, stayEnd(stay, timeZone) ?? start);
}

/** How long it is, as the row's own line says it: "6 nights". */
export function nightsLabel(
  stay: Stay,
  timeZone: string | null,
): string | null {
  const start = stayStart(stay, timeZone);
  const end = stayEnd(stay, timeZone);
  if (!start || !end) return null;

  const nights = daysBetween(start, end);
  if (nights <= 0) return null;
  return nights === 1 ? "1 night" : `${nights} nights`;
}

/**
 * The town, read off the address rather than asked for a second time.
 *
 *   "Carrer de la Mar 14, 07100 Sóller"  →  "Sóller"
 *   "Refugi de Múclet, Deià"             →  "Deià"
 *
 * The last part of the address, without the postcode in front of it. A
 * guess, but a cheap one: the alternative is a Town field the organizer
 * fills in twice for one answer, and the worst case here is a row that
 * names the wrong-sized place rather than no place at all.
 */
export function stayArea(stay: Stay): string | null {
  const address = stay.address?.trim();
  if (!address) return null;

  const last = address.split(",").pop()?.trim();
  if (!last) return null;

  return last.replace(/^\d{4,6}\s*/, "").trim() || null;
}

/** Earliest first, and the undated last: they belong to no day to sort by. */
export function staysInOrder(stays: Stay[]): Stay[] {
  return [...stays].sort((a, b) => {
    if (!a.checkIn && !b.checkIn) return a.name.localeCompare(b.name);
    if (!a.checkIn) return 1;
    if (!b.checkIn) return -1;
    return a.checkIn.localeCompare(b.checkIn);
  });
}

/**
 * Which roof you are under: the stay today falls inside, else the next
 * one to begin, else the last one there was.
 *
 * The run's opening block asks this, and it is the same question the
 * itinerary asks of a day — where am I — which is why it is answered by
 * the dates rather than by a "current" flag somebody has to maintain.
 */
export function currentStay(
  stays: Stay[],
  today: string,
  timeZone: string | null,
): Stay | undefined {
  const dated = staysInOrder(stays).filter(
    (stay) => stayStart(stay, timeZone) !== null,
  );
  if (dated.length === 0) return undefined;

  const inside = dated.find((stay) => {
    const start = stayStart(stay, timeZone)!;
    const end = stayEnd(stay, timeZone) ?? start;
    return start <= today && today <= end;
  });
  if (inside) return inside;

  const ahead = dated.find((stay) => stayStart(stay, timeZone)! > today);
  return ahead ?? dated[dated.length - 1];
}

