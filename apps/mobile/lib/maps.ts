/**
 * Where a place is, off the app: a Google Maps search.
 *
 * A search rather than a pin, because the only thing the app reliably
 * has is a name. Once the API carries `externalPlaceId` — it already
 * does on the place pair — this becomes a `query_place_id` link, which
 * lands on the place itself rather than on the best guess at it.
 */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
