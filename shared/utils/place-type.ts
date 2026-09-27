// Google place `types[]` → the app's nine event types.
// Ordered by specificity: the highest-priority match anywhere in the list
// wins, so the mapping never relies on `types[0]`.

export type EventTypeForPlace =
  | "travel"
  | "food_and_drink"
  | "arts_and_entertainment"
  | "outdoors"
  | "nightlife"
  | "wellness"
  | "shopping"
  | "lodging"
  | "misc";

const PLACE_TYPE_TABLE: Array<{
  eventType: EventTypeForPlace;
  googleTypes: string[];
}> = [
  {
    eventType: "lodging",
    googleTypes: [
      "lodging",
      "hotel",
      "motel",
      "resort_hotel",
      "guest_house",
      "hostel",
      "bed_and_breakfast",
    ],
  },
  {
    eventType: "travel",
    googleTypes: [
      "airport",
      "transit_station",
      "train_station",
      "bus_station",
      "subway_station",
      "light_rail_station",
      "car_rental",
      "travel_agency",
      "parking",
    ],
  },
  {
    eventType: "food_and_drink",
    googleTypes: [
      "restaurant",
      "cafe",
      "bakery",
      "coffee_shop",
      "meal_takeaway",
      "meal_delivery",
      "ice_cream_shop",
      "sandwich_shop",
    ],
  },
  {
    eventType: "nightlife",
    googleTypes: ["bar", "night_club", "casino"],
  },
  {
    eventType: "arts_and_entertainment",
    googleTypes: [
      "museum",
      "art_gallery",
      "movie_theater",
      "performing_arts_theater",
      "tourist_attraction",
      "amusement_park",
      "aquarium",
      "zoo",
      "stadium",
      "bowling_alley",
      "library",
    ],
  },
  {
    eventType: "outdoors",
    googleTypes: [
      "hiking_area",
      "park",
      "campground",
      "national_park",
      "rv_park",
      "natural_feature",
      "camp_site",
    ],
  },
  {
    eventType: "wellness",
    googleTypes: ["spa", "gym", "beauty_salon", "hair_care"],
  },
  {
    eventType: "shopping",
    googleTypes: [
      "clothing_store",
      "shopping_mall",
      "department_store",
      "store",
      "supermarket",
      "grocery_or_supermarket",
      "book_store",
      "electronics_store",
      "jewelry_store",
      "shoe_store",
      "furniture_store",
      "florist",
    ],
  },
];

export function eventTypeForPlace(types: string[]): EventTypeForPlace {
  const normalized = new Set(types.map((t) => t.toLowerCase()));
  for (const { eventType, googleTypes } of PLACE_TYPE_TABLE) {
    if (googleTypes.some((g) => normalized.has(g))) {
      return eventType;
    }
  }
  return "misc";
}
