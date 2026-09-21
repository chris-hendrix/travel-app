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
 *
 * `Intl` knows these names, but not in one locale: `en-US` calls New
 * York `EDT` and Madrid `GMT+2`, `en-GB` does the reverse. So the
 * locales are tried in turn and the first *name* wins — an offset is not
 * a name, and it is what the reader already failed to convert.
 *
 * A zone no locale names (Tokyo is `GMT+9` everywhere) falls back to the
 * abbreviation in our own list, which is the one source that works on a
 * runtime without full ICU. Then the offset, then the identifier: both
 * honest, neither an answer.
 */
export function getTimezoneAbbr(tz: string, at: Date = new Date()): string {
  // Cached per zone and per day: the answer changes with the season, and
  // a session that runs into November must not keep saying CEST.
  const key = `${tz}|${at.toISOString().slice(0, 10)}`;
  const cached = ABBR_CACHE.get(key);
  if (cached) return cached;

  const answer = resolveAbbr(tz, at);
  ABBR_CACHE.set(key, answer);
  return answer;
}

/** Locales that name zones, in the order worth trying. */
const SHORT_NAME_LOCALES = ["en-US", "en-GB", "en-CA", "en-AU"];

/** A bare offset, or nothing at all — what ICU says when it has no name. */
const OFFSET_FORM = /^(GMT|UTC)$|^(GMT|UTC)[+-]\d{1,2}(:\d{2})?$/;

/** What a name looks like: letters, and only a few of them. */
const NAME_FORM = /^[A-Za-z]{2,6}$/;

const ABBR_CACHE = new Map<string, string>();

function resolveAbbr(tz: string, at: Date): string {
  for (const locale of SHORT_NAME_LOCALES) {
    const name = shortName(tz, at, locale);
    if (name && NAME_FORM.test(name) && !OFFSET_FORM.test(name)) return name;
  }

  const curated = /\(([A-Z]{2,6})\)\s*$/.exec(getTimezoneLabel(tz))?.[1];
  if (curated) return curated;

  return shortName(tz, at, "en-US") ?? tz;
}

/** What one locale calls the zone, or null when it cannot say. */
function shortName(tz: string, at: Date, locale: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * The zone the device believes it is in. The default behind every
 * "yours" a surface offers, and the fallback when nobody chose one.
 */
export function getDetectedTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
