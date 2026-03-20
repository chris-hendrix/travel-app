// Shared utility functions for the Journiful platform

import { fromZonedTime, formatInTimeZone as formatInTz } from "date-fns-tz";

export { stripControlChars } from "./sanitize";

/**
 * Converts a date/time from a specific timezone to UTC
 * @param dateTime The date/time to convert (interpreted as being in the specified timezone)
 * @param timezone IANA timezone identifier (e.g., 'America/Los_Angeles')
 * @returns The date converted to UTC
 * @example
 * // Convert 3:00 PM PST to UTC
 * convertToUTC(new Date('2024-01-15 15:00:00'), 'America/Los_Angeles')
 */
export function convertToUTC(dateTime: Date, timezone: string): Date {
  return fromZonedTime(dateTime, timezone);
}

/**
 * Formats a date in a specific timezone
 * @param date The date to format
 * @param timezone IANA timezone identifier (e.g., 'America/New_York')
 * @param format Date format string (default: 'h:mm a' for 12-hour time)
 * @returns Formatted date string in the specified timezone
 * @example
 * // Format as '3:00 PM'
 * formatInTimeZone(new Date(), 'America/Los_Angeles')
 * // Format with custom pattern
 * formatInTimeZone(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss')
 */
export function formatInTimeZone(
  date: Date,
  timezone: string,
  format: string = "h:mm a",
): string {
  return formatInTz(date, timezone, format);
}

export {
  hexToHsl,
  hslToHex,
  derivePaletteVariants,
  deriveDarkPaletteVariants,
  readableForeground,
} from "./color-utils";
