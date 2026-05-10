/** Category keys for POI suggestions, matching the Discover tab */
export type POICategoryKey =
  | "food_and_drink"
  | "arts_and_entertainment"
  | "outdoors"
  | "nightlife";

/** A single POI suggestion stored in the poi_cache JSONB blob */
export interface POISuggestion {
  sourceId: string;           // fsq_place_id from Foursquare (or other vendor's place ID)
  name: string;
  address: string | null;     // location.formatted_address
  lat: number;
  lon: number;
  distance: number;           // meters from search center
  category: POICategoryKey;
  popularity: number | null;  // Premium-tier field (0-1), null in freePro
  price: number | null;       // Premium-tier field (1-4), null in freePro
  rating: number | null;      // Premium-tier field (0-10), null in freePro
  website: string | null;     // Foursquare Pro: website
  tel: string | null;         // Foursquare Pro: tel (local format)
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

/** Category configuration with Foursquare category IDs */
export interface POICategoryConfig {
  id: POICategoryKey;
  label: string;
  fsqCategoryIds: string;
}

export const POI_CATEGORIES: POICategoryConfig[] = [
  {
    id: "food_and_drink",
    label: "Food & Drink",
    fsqCategoryIds: "4d4b7105d754a06374d81259",
  },
  {
    id: "arts_and_entertainment",
    label: "Arts & Entertainment",
    fsqCategoryIds: "4d4b7104d754a06370d81259",
  },
  {
    id: "outdoors",
    label: "Outdoors",
    fsqCategoryIds: "4d4b7105d754a06377d81259",
  },
  {
    id: "nightlife",
    label: "Nightlife",
    fsqCategoryIds: "4bf58dd8d48988d116941735,4bf58dd8d48988d117941735,4bf58dd8d48988d118941735,4bf58dd8d48988d11b941735,4bf58dd8d48988d11d941735,4bf58dd8d48988d11e941735,4bf58dd8d48988d120941735,4bf58dd8d48988d121941735,4bf58dd8d48988d122941735",
  },
];
