import { toIso } from "@/lib/dateRange";

export type Selection = { start: string | null; end: string | null };
export type MonthCursor = { year: number; month: number };

/** Monday-first week, matching how trips read in Europe. */
export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

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

export function monthOf(iso: string): MonthCursor {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)) - 1,
  };
}

export function monthLabel(cursor: MonthCursor): string {
  return `${MONTH_NAMES[cursor.month]} ${cursor.year}`;
}

export function addMonths(cursor: MonthCursor, delta: number): MonthCursor {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * Six weeks of ISO dates covering the month, null for the blank cells
 * before and after it. Weeks are Monday-first.
 */
export function monthGrid(cursor: MonthCursor): Array<Array<string | null>> {
  const first = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Sunday(0) -> 6, Monday(1) -> 0

  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIso(new Date(cursor.year, cursor.month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/**
 * Two taps make a range. A tap with no selection starts one; a second
 * tap after it closes the range; a second tap before it restarts.
 */
export function applyDayTap(selection: Selection, iso: string): Selection {
  if (!selection.start || selection.end) return { start: iso, end: null };
  if (iso < selection.start) return { start: iso, end: null };
  return { start: selection.start, end: iso };
}

export function isInRange(selection: Selection, iso: string): boolean {
  if (!selection.start || !selection.end) return false;
  return iso > selection.start && iso < selection.end;
}

export function isEndpoint(selection: Selection, iso: string): boolean {
  return iso === selection.start || iso === selection.end;
}
