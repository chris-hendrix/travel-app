import { addDays, dayNumber, eachDay, weekdayAbbrev } from "@/lib/dateRange";

/**
 * One cell of the day strip: the day, the two facts its own label
 * carries, and whether the day is one of the trip's own.
 */
export type TravelDay = {
  /** The local date, yyyy-mm-dd — what the strip commits. */
  iso: string;
  /** Three letters: "Thu". */
  weekday: string;
  /** The day of the month, as it is written: "8". */
  day: string;
  /**
   * Whether this cell is one of the trip's own days rather than one of
   * the margin days either side of it. The strip carries both, and it
   * has to say which is which: a reader picking the day a flight lands
   * is looking for where the trip begins and ends, and the margin is the
   * part of the answer that is not the trip.
   */
  inTrip: boolean;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How many days the strip shows either side of the trip.
 *
 * Two, because the reasons a leg falls outside the trip are counted in
 * days and not in weeks: a flight that lands the evening before, a
 * red-eye that leaves the morning after the last night, a stay that
 * starts early or runs on. One day either side covered the red-eye home
 * and nothing else, so the day-before arrival had no cell to press.
 */
export const TRIP_MARGIN_DAYS = 2;

/**
 * The days a leg can fall on: the trip's own, and a couple of margin
 * days either side.
 *
 * The margin is the point of the whole thing. A leg's day is *about* the
 * trip but not bounded by it — check-out and the flight home land on the
 * morning after the last night, and people arrive the evening before —
 * and a month grid bounded by the trip drew those days as unmarked grey
 * cells nobody would think to press. Here every day a leg could plausibly
 * fall on is a cell, and the trip's own run is marked inside the strip
 * (`inTrip`) so the margin reads as the margin rather than as more trip.
 *
 * Nothing rather than a throw for an absent or malformed bound: this is
 * read on a screen that may be rendering before the trip has landed, and
 * a strip with no cells is a state a screen can show, while an exception
 * is not.
 */
export function travelDays(trip: {
  startDate: string;
  endDate: string;
}): TravelDay[] {
  const { startDate, endDate } = trip;
  if (!ISO.test(startDate) || !ISO.test(endDate)) return [];

  // `eachDay` is inclusive of both ends and empty when they are reversed,
  // which is the reading this wants: a trip with no days has no days. The
  // margin is added outside that check on purpose — a reversed trip is
  // still reversed after two days either side of it.
  return eachDay(
    addDays(startDate, -TRIP_MARGIN_DAYS),
    addDays(endDate, TRIP_MARGIN_DAYS),
  ).map((iso) => ({
    iso,
    weekday: weekdayAbbrev(iso),
    day: dayNumber(iso),
    // ISO dates compare as strings, which keeps this arithmetic-free: no
    // Date, no zone, and no dependency on the margin's size.
    inTrip: iso >= startDate && iso <= endDate,
  }));
}

/**
 * How many cells sit on one row of the strip.
 *
 * Five, not a computed fit: every weekday label is three letters, so the
 * cells are the same width anyway, and a fixed five keeps the grid even
 * from a phone to a desktop instead of re-flowing into a ragged shape.
 */
export const DAYS_PER_ROW = 5;

/**
 * The cells chunked into rows, padded with `null` so a short last row
 * keeps the same cell width as a full one.
 *
 * The padding is the whole job. Cells are `flex-1`, so without it an
 * eight-day strip's second row would stretch four cells to the width of
 * the first row's five and the grid would look broken rather than
 * short.
 */
export function travelDayRows(
  days: TravelDay[],
  perRow: number = DAYS_PER_ROW,
): Array<Array<TravelDay | null>> {
  if (days.length === 0 || perRow < 1) return [];

  const rows: Array<Array<TravelDay | null>> = [];
  for (let index = 0; index < days.length; index += perRow) {
    const row: Array<TravelDay | null> = days.slice(index, index + perRow);
    while (row.length < perRow) row.push(null);
    rows.push(row);
  }
  return rows;
}
