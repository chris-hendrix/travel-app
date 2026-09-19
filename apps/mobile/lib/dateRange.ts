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

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: (month ?? 1) - 1, day: day ?? 1 };
}

/** Local-date ISO (yyyy-mm-dd), never shifted by timezone. */
export function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Compact range for a card. The year is always present, because cards
 * are no longer grouped under year headings.
 *
 *   same month      "Sep 18–26, 2026"
 *   same year       "Sep 28 – Oct 3, 2026"
 *   across a year   "Dec 28, 2026 – Jan 3, 2027"
 */
export function formatDateRange(startIso: string, endIso: string): string {
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
