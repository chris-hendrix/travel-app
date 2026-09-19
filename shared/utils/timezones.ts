/**
 * Timezones the product knows by name: the options behind every zone
 * picker, and the three helpers around them.
 *
 * Lifted from the web app's constants so both apps read the same list —
 * a timezone a phone offers and the web does not is a bug waiting for a
 * user who owns both. Pure `Intl`, no DOM, no dependencies.
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
  { value: "Europe/Lisbon", label: "Western European Time - Lisbon (WET)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Europe/Berlin", label: "Central European Time - Berlin (CET)" },
  { value: "Europe/Rome", label: "Central European Time - Rome (CET)" },
  { value: "Europe/Madrid", label: "Central European Time - Madrid (CET)" },
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

  { value: "Atlantic/Reykjavik", label: "Greenwich Mean Time (GMT)" },

  // Africa
  { value: "Africa/Lagos", label: "West Africa Time (WAT)" },
  { value: "Africa/Cairo", label: "Eastern European Time - Cairo (EET)" },
  { value: "Africa/Johannesburg", label: "South Africa Standard Time (SAST)" },

  // Oceania
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (NZT)" },
] as const;

export type TimezoneOption = (typeof TIMEZONES)[number];

/**
 * A human-readable label for a zone ("Central European Time (CET)").
 * Falls back to the raw IANA identifier for a zone the list never
 * heard of, which is still more useful than nothing.
 */
export function getTimezoneLabel(tz: string): string {
  const found = TIMEZONES.find((t) => t.value === tz);
  return found ? found.label : tz;
}

/**
 * The zone's short name for display next to a clock ("EST", "CEST").
 * A clock without one is a number with no place: 8:30 could be dinner
 * in Mallorca or lunch in New York, and the reader cannot tell which.
 * Falls back to the identifier when the runtime cannot say it — Hermes
 * ships without full ICU on some builds, and a zone that reads raw is
 * still better than a time that reads zoneless.
 */
export function getTimezoneAbbr(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
}

/**
 * The zone the device believes it is in. The default behind every
 * "yours" a surface offers, and the fallback when nobody chose one.
 */
export function getDetectedTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
