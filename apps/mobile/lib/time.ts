/**
 * Times of day, as a person says them.
 *
 * Everything here works on a wall clock — "20:30" — rather than on an
 * instant, because that is what a picker sets and what the itinerary
 * reads back. Turning a wall clock into an instant is the trip's zone's
 * job, and it happens once, in `newEvent`.
 */

/** Fifteen minutes: the smallest step an itinerary ever needs. */
export const TIME_STEP_MINUTES = 15;

const MINUTES_IN_DAY = 24 * 60;

function pad(value: number): string {
  return `${value}`.padStart(2, "0");
}

/** "8:30" as well as "08:30", 24-hour. */
export function isClockTime(value: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/** Minutes since midnight. Only meaningful for a valid clock time. */
export function minutesOf(value: string): number {
  const [hour, minute] = value.trim().split(":").map(Number) as [
    number,
    number,
  ];
  return hour * 60 + minute;
}

/**
 * Every slot a picker offers, midnight first. A whole day rather than a
 * waking window: a red-eye is as much an event as a dinner.
 */
export function timeOptions(step: number = TIME_STEP_MINUTES): string[] {
  const options: string[] = [];
  for (let minutes = 0; minutes < MINUTES_IN_DAY; minutes += step) {
    options.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return options;
}

/**
 * The twelve-hour clock the itinerary already prints, so what you pick
 * is what the card says: "20:30" reads back as "8:30 PM".
 */
export function formatClock(value: string): string {
  if (!isClockTime(value)) return value;
  const hours = Math.floor(minutesOf(value) / 60);
  const minutes = pad(minutesOf(value) % 60);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}
