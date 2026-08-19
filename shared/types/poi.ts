/** Category keys for POI suggestions, matching the Discover tab */
export type POICategoryKey =
  | "food_and_drink"
  | "arts_and_entertainment"
  | "outdoors"
  | "nightlife"
  | "wellness"
  | "shopping"
  | "lodging";

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
  photoName: string | null;
  photoAttribution: string | null;
  googleMapsUri: string | null;
  businessStatus: string | null;
}

/** Response from GET /api/trips/:id/discover */
export interface POISuggestionsResponse {
  destination: string | null;
  source: string;
  categories: Record<POICategoryKey, POISuggestion[]>;
  partial?: boolean;
  errors?: Record<string, string>;
  attributions?: string[];
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
  supermarket: "Supermarket",
  grocery_store: "Grocery Store",
  lodging: "Lodging",
  hotel: "Hotel",
  motel: "Motel",
  guest_house: "Guest House",
  hostel: "Hostel",
  bed_and_breakfast: "Bed & Breakfast",
  gym: "Gym",
  spa: "Spa",
  beauty_salon: "Beauty Salon",
  shopping_mall: "Shopping Mall",
  book_store: "Bookstore",
  clothing_store: "Clothing Store",
  shoe_store: "Shoe Store",
  department_store: "Department Store",
  electronics_store: "Electronics Store",
  jewelry_store: "Jewelry Store",
  florist: "Florist",
  pet_store: "Pet Store",
  bicycle_store: "Bike Shop",
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
    googleTypes: ["restaurant", "cafe", "bakery", "meal_takeaway", "meal_delivery"],
  },
  {
    id: "arts_and_entertainment",
    label: "Arts & Leisure",
    googleTypes: [
      "movie_theater", "museum", "art_gallery", "performing_arts_theater",
      "library", "bowling_alley", "casino",
    ],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    googleTypes: [
      "park", "tourist_attraction", "campground", "hiking_area", "beach",
      "garden", "plaza", "marina", "scenic_lookout", "natural_feature",
      "zoo", "aquarium", "amusement_park",
    ],
  },
  {
    id: "nightlife",
    label: "Nightlife",
    googleTypes: ["night_club", "bar"],
  },
  {
    id: "wellness",
    label: "Wellness & Fitness",
    googleTypes: ["gym", "spa", "beauty_salon"],
  },
  {
    id: "shopping",
    label: "Shopping",
    googleTypes: [
      "shopping_mall", "book_store", "clothing_store", "shoe_store",
      "department_store", "electronics_store", "jewelry_store", "florist",
      "pet_store", "bicycle_store", "supermarket", "grocery_store", "liquor_store",
    ],
  },
  {
    id: "lodging",
    label: "Stays",
    googleTypes: ["lodging", "hotel", "motel", "guest_house", "hostel", "bed_and_breakfast"],
  },
];
