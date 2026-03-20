/**
 * Shared constants for the Journiful web app
 */

/**
 * Available timezone options for trip and profile forms
 */
export const TIMEZONES = [
  // Americas
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "America/Toronto", label: "Eastern Time - Toronto (ET)" },
  { value: "America/Mexico_City", label: "Mexico City Time (CST)" },
  { value: "America/Sao_Paulo", label: "Bras\u00edlia Time (BRT)" },
  {
    value: "America/Argentina/Buenos_Aires",
    label: "Argentina Time (ART)",
  },

  // Europe
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Europe/Berlin", label: "Central European Time - Berlin (CET)" },
  { value: "Europe/Rome", label: "Central European Time - Rome (CET)" },
  { value: "Europe/Athens", label: "Eastern European Time (EET)" },
  { value: "Europe/Moscow", label: "Moscow Time (MSK)" },
  { value: "Europe/Istanbul", label: "Turkey Time (TRT)" },

  // Asia
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST)" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
  { value: "Asia/Bangkok", label: "Indochina Time (ICT)" },
  { value: "Asia/Jakarta", label: "Western Indonesia Time (WIB)" },
  { value: "Asia/Singapore", label: "Singapore Time (SGT)" },
  { value: "Asia/Taipei", label: "Taipei Standard Time (CST)" },
  { value: "Asia/Shanghai", label: "China Standard Time (CST)" },
  { value: "Asia/Seoul", label: "Korea Standard Time (KST)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },

  // Africa
  { value: "Africa/Lagos", label: "West Africa Time (WAT)" },
  { value: "Africa/Cairo", label: "Eastern European Time - Cairo (EET)" },
  { value: "Africa/Johannesburg", label: "South Africa Standard Time (SAST)" },

  // Oceania
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (NZT)" },
] as const;

/** Sentinel value used in the timezone select to represent auto-detect (null) */
export const TIMEZONE_AUTO_DETECT = "__auto__";

/**
 * Detect the user's timezone from the browser.
 * @returns IANA timezone identifier (e.g. "America/New_York")
 */
export function getDetectedTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Find a human-readable label for a timezone from the TIMEZONES constant.
 * Falls back to the raw IANA identifier if not found.
 */
export function getTimezoneLabel(tz: string): string {
  const found = TIMEZONES.find((t) => t.value === tz);
  return found ? found.label : tz;
}
