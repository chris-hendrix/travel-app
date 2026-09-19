import { getDetectedTimezone, getTimezoneAbbr } from "@journiful/shared/utils";
import { toIso } from "@/lib/dateRange";
import { joinFacts } from "@/lib/wording";

/**
 * A wall clock: what a moment reads as on a wall, somewhere.
 *
 * `Intl` does the conversion when the runtime knows the zone, and the
 * device's own zone is the fallback when it does not — Hermes ships
 * without full ICU on some builds, and a trip whose zone the runtime
 * cannot parse should still show times rather than nothing. Guarding it
 * here means one place throws, not every card.
 *
 * Zod — no: the alternative to `Intl` is date-fns-tz or luxon, a
 * dependency for one toggle. If the fallback ever fires on a device,
 * that is the moment to take one.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = FORMATTERS.get(timeZone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    formatter = null;
  }

  FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/** Twelve-hour clock off a Date, which is already in the device's zone. */
function deviceClock(date: Date): string {
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** The device's own zone, twenty-four hour, the way a field asks for it. */
function deviceTwentyFour(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

export function wallClock(
  iso: string,
  timeZone: string | null,
): { date: string; time: string; clock: string } {
  const moment = new Date(iso);
  const formatter = timeZone ? formatterFor(timeZone) : null;

  if (!formatter) {
    return {
      date: toIso(moment),
      time: deviceClock(moment),
      clock: deviceTwentyFour(moment),
    };
  }

  const parts = formatter.formatToParts(moment);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((piece) => piece.type === type)?.value ?? "";

  const hour = Number(part("hour"));
  const minute = part("minute");
  const afternoon = part("dayPeriod") === "PM";
  // The formatter reads twelve-hour, so midnight and noon need saying
  // back in twenty-four.
  const hour24 = hour === 12 ? (afternoon ? 12 : 0) : afternoon ? hour + 12 : hour;

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${hour === 0 ? 12 : hour}:${minute} ${part("dayPeriod")}`,
    clock: `${`${hour24}`.padStart(2, "0")}:${minute}`,
  };
}

/** What day it is, somewhere. The grouping and the labels agree on this. */
export function todayIn(timeZone: string | null, now: Date = new Date()): string {
  return wallClock(now.toISOString(), timeZone).date;
}

/**
 * The zone a clock is read in, said out loud.
 *
 * Every rendered time carries one, because a clock without a place is a
 * number nobody can trust: 8:30 could be dinner in Mallorca or lunch in
 * New York, and the row will not say which. `null` is the device's own
 * zone, so it names the detected one rather than printing nothing.
 */
export function zoneAbbr(timeZone: string | null): string {
  return getTimezoneAbbr(timeZone ?? getDetectedTimezone());
}

/**
 * One clock, with its zone: the only string a row ever needs for a
 * moment. Joined through the one helper so a fact and its place are
 * never punctuated two ways on two screens.
 */
export function clockLabel(iso: string, timeZone: string | null): string {
  return joinFacts(wallClock(iso, timeZone).time, zoneAbbr(timeZone));
}

/**
 * A zone's offset from UTC in minutes, at a moment. The device answers
 * for itself off its own clock; any other zone is read off what `Intl`
 * says the wall shows there, which is the same conversion `wallClock`
 * already trusts. Forms stamp what was typed through this, so the
 * offset and the label always agree about where a time was read.
 */
export function zoneOffsetMinutes(
  timeZone: string | null,
  atIso: string = new Date().toISOString(),
): number {
  const moment = new Date(atIso);
  if (!timeZone) return -moment.getTimezoneOffset();

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(moment);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((piece) => piece.type === type)?.value ?? "";
    const asUtc = Date.UTC(
      Number(part("year")),
      Number(part("month")) - 1,
      Number(part("day")),
      Number(part("hour")) % 24,
      Number(part("minute")),
      Number(part("second")),
    );
    return Math.round((asUtc - moment.getTime()) / 60_000);
  } catch {
    return -moment.getTimezoneOffset();
  }
}
