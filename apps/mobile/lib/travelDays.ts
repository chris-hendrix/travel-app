import { addDays, dayNumber, eachDay, weekdayAbbrev } from "@/lib/dateRange";

/**
 * One cell of the day strip: the day, and the two facts its own label
 * carries. The weekday and the number are here rather than in the
 * component for the same reason `lib/dropdown.ts` holds the picker's
 * rules — this suite has no renderer, so anything worth asserting lives
 * where a spec can reach it.
 */
export type TravelDay = {
  /** The local date, yyyy-mm-dd — what the strip commits. */
  iso: string;
  /** Three letters: "Thu". */
  weekday: string;
  /** The day of the month, as it is written: "8". */
  day: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The days a leg can fall on: the trip's own, and then the morning after
 * it ends.
 *
 * The last cell is the point of the whole thing. A leg's day is bounded
 * by the trip, and a stay is booked through its last night — so check-out
 * and the flight home land on the day *after* the trip ends. A month grid
 * bounded by the trip draws that day as an unmarked grey cell nobody
 * would think to press; a strip of the trip's own days makes it the last
 * cell, which is where the answer is.
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
  // which is the reading this wants: a trip with no days has no days.
  return eachDay(startDate, addDays(endDate, 1)).map((iso) => ({
    iso,
    weekday: weekdayAbbrev(iso),
    day: dayNumber(iso),
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
