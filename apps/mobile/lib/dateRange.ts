const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year ?? 1970, month: (month ?? 1) - 1, day: day ?? 1 };
}

/** Local-date ISO (yyyy-mm-dd), never shifted by timezone. */
export function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Compact day for a section heading. No year: an itinerary's days sit
 * inside a trip whose dates the header already carries.
 */
export function formatDay(iso: string): string {
  const { year, month, day } = parts(iso);
  const weekday = WEEKDAYS[new Date(year, month, day).getDay()];
  return `${weekday} ${MONTHS[month]} ${day}`;
}

/** The weekday, three letters: "Fri". */
export function weekdayAbbrev(iso: string): string {
  const { year, month, day } = parts(iso);
  return WEEKDAYS[new Date(year, month, day).getDay()] ?? "";
}

/** The day of the month, as it is written: "18". */
export function dayNumber(iso: string): string {
  return `${parts(iso).day}`;
}

/** Which month a day is in, for grouping: "2026-09". */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** The month, spelled out, for a heading above its days. */
export function monthName(iso: string): string {
  return MONTH_NAMES[parts(iso).month] ?? "";
}

import { wallClock } from "@/lib/timezone";

/**
 * When something is, in the fewest words that stay accurate: one clock
 * for a moment, two for a stretch.
 *
 * The zone is the trip's own when the itinerary is reading in it, and
 * the device's when it is not.
 */
export function formatTimeRange(
  startIso: string,
  endIso: string | null,
  timeZone: string | null = null,
): string {
  const start = wallClock(startIso, timeZone).time;
  if (!endIso) return start;

  const end = wallClock(endIso, timeZone).time;
  return end === start ? start : `${start} – ${end}`;
}

/**
 * Compact range for a card. The year is always present, because cards
 * are no longer grouped under year headings.
 *
 *   same month      "Sep 18–26, 2026"
 *   same year       "Sep 28 – Oct 3, 2026"
 *   across a year   "Dec 28, 2026 – Jan 3, 2027"
 */export function formatDateRange(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);

  if (s.year === e.year && s.month === e.month) {
    return `${MONTHS[s.month]} ${s.day}–${e.day}, ${s.year}`;
  }
  if (s.year === e.year) {
    return `${MONTHS[s.month]} ${s.day} – ${MONTHS[e.month]} ${e.day}, ${s.year}`;
  }
  return `${MONTHS[s.month]} ${s.day}, ${s.year} – ${MONTHS[e.month]} ${e.day}, ${e.year}`;
}

/**
 * A span of days, as compactly as it stays accurate: the month is named
 * once when both ends are in it.
 *
 *   same month   "Sep 17–23"
 *   across one   "Sep 28 – Oct 3"
 *
 * The en dash, the same mark the trip card's own range uses and the same
 * one a clock range uses: the app has one way of writing a range, and a
 * stay is a range. A year is left off because a stay's days sit inside a
 * trip whose dates the screen has already said.
 */
export function formatDaySpan(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);

  if (s.year === e.year && s.month === e.month) {
    return `${MONTHS[s.month]} ${s.day}–${e.day}`;
  }
  return `${MONTHS[s.month]} ${s.day} – ${MONTHS[e.month]} ${e.day}`;
}

/** A local day, moved. Used one day at a time, for the edges of a trip. */
export function addDays(iso: string, days: number): string {
  // `parts` hands back a zero-based month, which is also what Date wants.
  const { year, month, day } = parts(iso);
  const date = new Date(year, month, day);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/**
 * Every local date from start to end, inclusive. The day options for
 * placing an event inside a trip.
 */
export function eachDay(startIso: string, endIso: string): string[] {
  const s = parts(startIso);
  const e = parts(endIso);
  const last = new Date(e.year, e.month, e.day);
  const days: string[] = [];

  for (
    let date = new Date(s.year, s.month, s.day);
    date <= last;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  ) {
    days.push(toIso(date));
  }

  return days;
}
