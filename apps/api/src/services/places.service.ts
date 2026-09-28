import type { CachedPhoto } from "@journiful/shared/types";

export const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

/** Autocomplete request mask: predictions + types + distance. */
export const AUTOCOMPLETE_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types,suggestions.placePrediction.distanceMeters";

/** Details mask: Essentials + photos + addressComponents. No displayName:
 * no client reads the details name (Phase 9) — pickers commit the
 * tapped row's label and read coordinates only. */
export const DETAILS_FIELD_MASK =
  "id,photos,formattedAddress,location,addressComponents,attributions";

/** Gross-distance outlier cutoff in metres (matches distanceMeters units). */
export const AUTOCOMPLETE_MAX_DISTANCE_METERS = 250_000;

/** Named photo boxes in pixels (square). */
export const BOX_PIXELS = { card: 1024, hero: 1920 } as const;
export type PlaceBoxName = keyof typeof BOX_PIXELS;

export class PlacesError extends Error {
  readonly code = "SERVICE_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "PlacesError";
  }
}

export type AutocompleteSuggestion = {
  placeId: string;
  shortName: string;
  displayName: string;
  displayAddress: string;
  types: string[];
  distanceMeters: number | null;
};

/** Most specific first: the town you would name, then the ones you would accept. */
export const LOCALITY_COMPONENT_TYPES = [
  "locality",
  "postal_town",
  "sublocality_level_1",
  "sublocality",
  "administrative_area_level_2",
] as const;

export type AddressComponent = {
  longText: string;
  shortText: string;
  types: string[];
  languageCode: string;
};

export function pickAddressComponent(
  components: readonly AddressComponent[] | undefined,
  types: readonly string[],
  field: "longText" | "shortText",
): string | null {
  if (!components) return null;
  for (const t of types) {
    const found = components.find((c) => c.types.includes(t));
    if (found) return found[field] ?? null;
  }
  return null;
}

export type PlaceDetailsResult = {
  placeId: string;
  /** Always "": displayName is excluded from the mask, so the name is
   * unknown. Never render; use the entity snapshot (place_name). */
  name: string;
  address: string | null;
  shortAddress: string | null;
  lat: number | null;
  lon: number | null;
  photos: CachedPhoto[];
  country: string | null;
  locality: string | null;
};

type RawPrediction = {
  placeId: string;
  text: { text: string };
  structuredFormat?: {
    mainText?: { text: string };
    secondaryText?: { text: string };
  };
  types?: string[];
  distanceMeters?: number;
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timeout) };
}

export async function autocompletePlaces(opts: {
  input: string;
  sessionToken: string;
  lat?: number | undefined;
  lon?: number | undefined;
  country?: string | undefined;
  apiKey: string;
}): Promise<AutocompleteSuggestion[]> {
  const { input, sessionToken, lat, lon, country, apiKey } = opts;
  const body: Record<string, unknown> = { input, sessionToken };
  if (lat != null && lon != null) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lon }, radius: 50000 },
    };
    body.origin = { latitude: lat, longitude: lon };
  }
  if (country) {
    body.includedRegionCodes = [country];
  }
  const t = withTimeout(3000);
  try {
    const response = await fetch(`${GOOGLE_PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      signal: t.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new PlacesError("Google Places Autocomplete returned an error");
    }
    const data = (await response.json()) as {
      suggestions?: Array<{ placePrediction: RawPrediction }>;
    };
    const seen = new Set<string>();
    const out: AutocompleteSuggestion[] = [];
    for (const s of data.suggestions ?? []) {
      const p = s.placePrediction;
      if (seen.has(p.placeId)) continue;
      seen.add(p.placeId);
      const distanceMeters =
        typeof p.distanceMeters === "number" ? p.distanceMeters : null;
      if (
        distanceMeters != null &&
        distanceMeters > AUTOCOMPLETE_MAX_DISTANCE_METERS
      ) {
        continue;
      }
      out.push({
        placeId: p.placeId,
        shortName: p.structuredFormat?.mainText?.text ?? p.text.text,
        displayName: p.text.text,
        displayAddress: p.structuredFormat?.secondaryText?.text ?? "",
        types: p.types ?? [],
        distanceMeters,
      });
    }
    return out;
  } catch (err) {
    if (err instanceof PlacesError) throw err;
    throw new PlacesError("Google Places Autocomplete request failed");
  } finally {
    t.done();
  }
}

type RawDetails = {
  id: string;
  displayName?: { text: string; languageCode: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
    languageCode: string;
  }>;
  photos?: Array<{
    name: string;
    widthPx: number;
    heightPx: number;
    authorAttributions?: Array<{
      displayName: string;
      uri?: string;
      photoUri?: string;
    }>;
    googleMapsUri?: string;
  }>;
};

export async function fetchPlaceDetails(opts: {
  placeId: string;
  sessionToken: string;
  apiKey: string;
}): Promise<PlaceDetailsResult> {
  const { placeId, sessionToken, apiKey } = opts;
  const url = new URL(`${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("sessionToken", sessionToken);
  const t = withTimeout(5000);
  try {
    const response = await fetch(url.toString(), {
      signal: t.signal,
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    });
    if (!response.ok) {
      throw new PlacesError("Google Places API returned an error");
    }
    const data = (await response.json()) as RawDetails;
    const photos: CachedPhoto[] = (data.photos ?? []).map((p) => ({
      ref: p.name,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      authorName: p.authorAttributions?.[0]?.displayName ?? null,
      authorUri: p.authorAttributions?.[0]?.uri ?? null,
      authorPhotoUri: p.authorAttributions?.[0]?.photoUri ?? null,
      mapsUri: p.googleMapsUri ?? null,
    }));
    const country =
      pickAddressComponent(data.addressComponents, ["country"], "shortText");
    const locality = pickAddressComponent(
      data.addressComponents,
      LOCALITY_COMPONENT_TYPES,
      "longText",
    );
    return {
      placeId: data.id,
      // displayName is deliberately absent from DETAILS_FIELD_MASK (Pro
      // tier; requesting it would force Enterprise + Atmosphere billing),
      // so there is no display name to cache. `name` is therefore always
      // empty (unknown) — never the formatted address. Do NOT render
      // `name`; the human-readable name lives in the entity snapshot
      // (trips/events/accommodations place_name), committed at pick time.
      // `address` below carries the formatted address.
      name: "",
      address: data.formattedAddress ?? null,
      shortAddress: null,
      lat: data.location?.latitude ?? null,
      lon: data.location?.longitude ?? null,
      photos,
      country,
      locality,
    };
  } catch (err) {
    if (err instanceof PlacesError) throw err;
    throw new PlacesError("Google Places API request failed");
  } finally {
    t.done();
  }
}

export async function fetchPlacePhotoMedia(opts: {
  photoRef: string;
  maxWidthPx: number;
  maxHeightPx: number;
  apiKey: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { photoRef, maxWidthPx, maxHeightPx, apiKey } = opts;
  const url = `${GOOGLE_PLACES_BASE}/${photoRef}/media?key=${apiKey}&maxWidthPx=${maxWidthPx}&maxHeightPx=${maxHeightPx}`;
  const t = withTimeout(5000);
  try {
    const response = await fetch(url, { signal: t.signal });
    if (!response.ok) {
      throw new PlacesError(`Google Places media returned ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get("content-type") ?? "image/jpeg";
    return { buffer: bytes, contentType };
  } catch (err) {
    if (err instanceof PlacesError) throw err;
    throw new PlacesError("Google Places media request failed");
  } finally {
    t.done();
  }
}
