// Shared place-cache contract. Shapes are exactly as specified in the
// place-metadata plan: no `category`, no `providerTypes`, no `mapsUrl`.

export type PlaceBox = "card" | "hero";

export type CachedPhoto = {
  ref: string; // "places/<id>/photos/<ref>" — the media call's path
  widthPx: number;
  heightPx: number;
  authorName: string | null;
  authorUri: string | null; // author profile — the attribution link
  authorPhotoUri: string | null; // author avatar
  mapsUri: string | null; // photos[].googleMapsUri — the required source link
};

export type CachedPlaceDetails = {
  v: 1; // mirrors the schema_version column
  name: string;
  address: string | null; // formattedAddress — the missing city/state
  shortAddress: string | null;
  lat: number | null;
  lon: number | null;
  photos: CachedPhoto[];
  country: string | null; // addressComponents' country shortText, e.g. "ES"
  locality?: string | null; // addressComponents' locality, the town a card badges
};

export type PlaceSummary = {
  placeId: string;
  name: string;
  address: string | null;
  photoUrl: string | null; // BASE url; the client appends ?size=
  photoAttribution: {
    name: string;
    uri: string | null;
    photoUri: string | null;
  } | null;
  photoSourceUri: string | null; // the googleMapsUri the policy requires
  country: string | null; // the autocomplete region floor's input
  locality: string | null; // addressComponents' locality, the town a card badges
};
