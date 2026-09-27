/**
 * Where things live, off the app.
 *
 * One module because they are one concern — a place, an account, a
 * profile — and all of them end in the same act: hand a URL to the
 * platform and let it decide whether the app or the browser answers.
 */

/**
 * A place, as a Google Maps search.
 *
 * A search, for when the row carries no linked place — the user typed
 * text rather than picking a Google result, or the row predates place
 * linking. When a place id is linked, use `placeMapsUrl` instead: the
 * pinned link lands on the place itself rather than on the best guess
 * at it.
 */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * A linked place, as a pinned Google Maps link.
 *
 * With a place id the link pins to the place itself (`query_place_id`);
 * the text query rides along as the pin's label. Without one it falls
 * back to the plain search — the typed-text case, which has no pin.
 */
export function placeMapsUrl(
  placeId: string | null | undefined,
  query: string,
): string {
  if (!placeId) return mapsSearchUrl(query);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
}

/**
 * The query for a place on a trip: the place, then the trip it is on.
 * "Trattoria Nuova, Mallorca" finds the restaurant; "Trattoria Nuova"
 * on its own finds every one of them.
 */
export function placeQuery(place: string, near?: string | null): string {
  const trimmed = place.trim();
  const context = near?.trim();
  if (!context) return trimmed;

  // Nothing to disambiguate against if the place already says where it
  // is — "Mallorca, Spain" is not improved by "Mallorca, Spain, Mallorca".
  return trimmed.toLowerCase().includes(context.toLowerCase())
    ? trimmed
    : `${trimmed}, ${context}`;
}

/**
 * Handles arrive with or without the @, depending on who typed them.
 * Stripped rather than rejected: it is the same account either way, and
 * a URL with "@" in it is a 404.
 */
function bareHandle(handle: string): string {
  return handle.trim().replace(/^@/, "");
}

/**
 * A Venmo profile. The `/u/` form: bare `venmo.com/<name>` still
 * redirects but has been doing so for years.
 */
export function venmoUrl(handle: string): string {
  return `https://venmo.com/u/${encodeURIComponent(bareHandle(handle))}`;
}

/** An Instagram profile. */
export function instagramUrl(handle: string): string {
  return `https://instagram.com/${encodeURIComponent(bareHandle(handle))}`;
}
