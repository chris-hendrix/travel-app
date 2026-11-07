/**
 * Saved-place types and response interfaces
 */

import type { PlaceSummary } from "./place";

/**
 * Saved-place entity
 */
export interface SavedPlace {
  id: string;
  tripId: string;
  createdBy: string;
  name: string;
  address: string | null;
  /** The member's note — the saver's own comment on the place. */
  notes: string | null;
  placeType: "travel" | "food_and_drink" | "arts_and_entertainment" | "outdoors" | "nightlife" | "wellness" | "shopping" | "lodging" | "misc";
  /** Resolved place summary; null for typed-word places carrying no placeId */
  place: PlaceSummary | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * API response for fetching multiple saved places
 */
export interface GetSavedPlacesResponse {
  success: true;
  savedPlaces: SavedPlace[];
}

/**
 * API response for fetching a single saved place
 */
export interface GetSavedPlaceResponse {
  success: true;
  savedPlace: SavedPlace;
}

/**
 * API response for creating a saved place
 */
export interface CreateSavedPlaceResponse {
  success: true;
  savedPlace: SavedPlace;
}

/**
 * API response for updating a saved place
 */
export interface UpdateSavedPlaceResponse {
  success: true;
  savedPlace: SavedPlace;
}
