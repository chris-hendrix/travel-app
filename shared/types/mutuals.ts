// Mutuals types for the Journiful platform

/**
 * A user who shares at least one trip with the current user
 */
export interface Mutual {
  /** User ID (UUID) */
  id: string;
  /** User's display name */
  displayName: string;
  /** URL to user's profile photo, or null */
  profilePhotoUrl: string | null;
  /** Number of trips shared with the current user */
  sharedTripCount: number;
  /** List of trips shared with the current user */
  sharedTrips: { id: string; name: string }[];
}

/**
 * API response for fetching mutuals (cursor-paginated)
 */
export interface GetMutualsResponse {
  success: true;
  mutuals: Mutual[];
  nextCursor: string | null;
}
