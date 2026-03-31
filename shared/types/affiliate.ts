/** Gap types detected in trip itinerary */
export type GapType =
  | "missing_travel"
  | "no_accommodation"
  | "empty_day"
  | "missing_meal";

/** Suggestion types mapping to Booking.com product types */
export type SuggestionType = "flights" | "hotels" | "attractions";

/** Partner display info included in each suggestion card */
export interface SuggestionPartner {
  slug: string;
  name: string;
}

/** A single affiliate suggestion card returned by the API */
export interface SuggestionCard {
  id: string;
  gapType: GapType;
  suggestionType: SuggestionType;
  title: string;
  description: string;
  affiliateUrl: string;
  partner: SuggestionPartner;
  dismissKey: string;
  /** ISO date string for day-level suggestions, null for trip-level */
  day: string | null;
  priority: number;
}

/** Context extracted from a trip used to build deep links */
export interface TripContext {
  destination: string;
  lat: number | null;
  lon: number | null;
  startDate: string | null;
  endDate: string | null;
  dayDate?: string;
  origin?: string;
}

/** Response shape for GET /trips/:tripId/suggestions */
export interface SuggestionsResponse {
  success: true;
  suggestions: SuggestionCard[];
}

/** Input shape for POST /trips/:tripId/suggestions/dismiss */
export interface DismissSuggestionInput {
  suggestionType: string;
  suggestionKey: string;
}
