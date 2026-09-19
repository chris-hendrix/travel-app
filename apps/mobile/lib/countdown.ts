import { toIso } from "@/lib/dateRange";

/** Whole days between two local dates. DST-safe: no local clock involved. */
export function daysBetween(fromIso: string, toIsoDate: string): number {
  const [fromYear, fromMonth, fromDay] = fromIso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [toYear, toMonth, toDay] = toIsoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const to = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((to - from) / 86_400_000);
}

/**
 * How soon a trip is, in the fewest words that stay accurate.
 *
 * Returns null once a trip has finished — a finished trip has no
 * countdown, and the card is calmer for saying nothing.
 */
export function tripCountdown(
  startDate: string,
  endDate: string,
  today: Date = new Date(),
): string | null {
  const now = toIso(today);

  if (endDate < now) return null;
  if (startDate <= now) return "underway";

  const days = daysBetween(now, startDate);
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
