/** Category keys for POI suggestions, matching the Discover tab */
export type POICategoryKey =
  | "food_and_drink"
  | "arts_and_entertainment"
  | "outdoors"
  | "nightlife";

/** A single POI suggestion stored in the poi_cache JSONB blob */
export interface POISuggestion {
  sourceId: string;           // Google place ID
  name: string;
  address: string | null;     // location.formatted_address
  lat: number;
  lon: number;
  distance: number;           // meters from search center
  category: POICategoryKey;
  popularity: number | null;  // Premium-tier field (0-1), null in freePro
  price: number | null;       // Premium-tier field (1-4), null in freePro
  rating: number | null;      // Premium-tier field (0-10), null in freePro
  website: string | null;     // nullable
  tel: string | null;         // nullable
  subcategory: string | null; // categories[0].name (e.g. "Italian Restaurant")
  eventId: string | null;     // FK to events.id when converted to a trip event
}

/** Response from GET /api/trips/:id/discover */
export interface POISuggestionsResponse {
  destination: string | null;
  source: string;
  categories: Record<POICategoryKey, POISuggestion[]>;
  partial?: boolean;
  errors?: Record<string, string>;
}

/** Google Places type labels */
export const googleTypeLabels: Record<string, string> = {
  restaurant: "Restaurant",
  bar: "Bar",
  cafe: "Cafe",
  bakery: "Bakery",
  meal_takeaway: "Takeaway",
  meal_delivery: "Delivery",
  movie_theater: "Movie Theater",
  museum: "Museum",
  art_gallery: "Art Gallery",
  performing_arts_theater: "Performing Arts Theater",
  amusement_park: "Amusement Park",
  zoo: "Zoo",
  aquarium: "Aquarium",
  casino: "Casino",
  night_club: "Nightclub",
  tourist_attraction: "Tourist Attraction",
  library: "Library",
  bowling_alley: "Bowling Alley",
  park: "Park",
  campground: "Campground",
  hiking_area: "Hiking Area",
  beach: "Beach",
  garden: "Garden",
  plaza: "Plaza",
  marina: "Marina",
  scenic_lookout: "Scenic Lookout",
  natural_feature: "Natural Feature",
  liquor_store: "Liquor Store",
};

/** Category configuration with Google Places types */
export interface POICategoryConfig {
  id: POICategoryKey;
  label: string;
  googleTypes: string[];
}

export const POI_CATEGORIES: POICategoryConfig[] = [
  {
    id: "food_and_drink",
    label: "Food & Drink",
    googleTypes: [
      "restaurant",
      "bar",
      "cafe",
      "bakery",
      "meal_takeaway",
      "meal_delivery",
    ],
  },
  {
    id: "arts_and_entertainment",
    label: "Arts & Entertainment",
    googleTypes: [
      "movie_theater",
      "museum",
      "art_gallery",
      "performing_arts_theater",
      "amusement_park",
      "zoo",
      "aquarium",
      "casino",
      "night_club",
      "tourist_attraction",
      "library",
      "bowling_alley",
    ],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    googleTypes: [
      "park",
      "tourist_attraction",
      "campground",
      "hiking_area",
      "beach",
      "garden",
      "plaza",
      "marina",
      "scenic_lookout",
      "natural_feature",
    ],
  },
  {
    id: "nightlife",
    label: "Nightlife",
    googleTypes: [
      "night_club",
      "bar",
      "liquor_store",
    ],
  },
];
