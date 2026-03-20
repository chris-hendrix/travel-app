/**
 * Shared formatting utilities for the Journiful web app
 */

import { parsePhoneNumber } from "react-phone-number-input";

// Hoisted Intl.DateTimeFormat instances for performance (created once at module load)
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

/**
 * Parse a date string (YYYY-MM-DD) as a UTC Date
 */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format a date range for display
 * Handles cases: both null, only start, only end, same month, different months
 *
 * @param start - Start date string (YYYY-MM-DD) or null
 * @param end - End date string (YYYY-MM-DD) or null
 * @returns Formatted date range string
 */
export function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) return "Dates TBD";

  if (!start && end) return `Ends ${fullDateFormatter.format(parseDate(end))}`;
  if (start && !end)
    return `Starts ${fullDateFormatter.format(parseDate(start))}`;

  // Both dates present
  const startDate = parseDate(start!);
  const endDate = parseDate(end!);

  const startMonth = monthFormatter.format(startDate);
  const startDay = startDate.getUTCDate();
  const endMonth = monthFormatter.format(endDate);
  const endDay = endDate.getUTCDate();
  const year = endDate.getUTCFullYear();

  // Same month
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }

  // Different months
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

/**
 * Get initials from a name (up to 2 characters)
 *
 * @param name - Full name string
 * @returns Uppercase initials (1-2 characters)
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format a timestamp as a relative time string
 *
 * @param isoString - ISO 8601 date string
 * @returns Human-readable relative time (e.g. "just now", "5m ago", "2h ago", "3d ago", or "Feb 15")
 */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const date = new Date(isoString).getTime();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a phone number for display using international format.
 * @param phone - Phone number string (E.164 format recommended, e.g. "+14155552671")
 * @returns Formatted phone number (e.g. "+1 415 555 2671") or the raw string if parsing fails
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  try {
    const parsed = parsePhoneNumber(phone);
    if (parsed) {
      return parsed.formatInternational();
    }
    return phone;
  } catch {
    return phone;
  }
}
