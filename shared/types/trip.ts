// Trip-related types for the Journiful platform

/**
 * Trip type from database schema
 * Matches the Trip type from apps/api/src/db/schema/index.ts
 */
export interface Trip {
  /** Unique trip identifier (UUID) */
  id: string;
  /** Trip name/title */
  name: string;
  /** Trip destination location */
  destination: string;
  /** Destination latitude (from geocoding) */
  destinationLat: number | null;
  /** Destination longitude (from geocoding) */
  destinationLon: number | null;
  /** Trip start date (ISO 8601 string, null if not set) */
  startDate: string | null;
  /** Trip end date (ISO 8601 string, null if not set) */
  endDate: string | null;
  /** Preferred IANA timezone for the trip */
  preferredTimezone: string;
  /** Optional trip description */
  description: string | null;
  /** Optional cover image URL */
  coverImageUrl: string | null;
  /** User ID of the trip creator */
  createdBy: string;
  /** Whether non-organizer members can add events */
  allowMembersToAddEvents: boolean;
  /** Whether all members are visible to each other (vs only organizers visible) */
  showAllMembers: boolean;
  /** Theme preset ID (references THEME_PRESETS, not a DB FK) */
  themeId: string | null;
  /** Font choice, independent of theme */
  themeFont: string | null;
  /** Whether the trip has been cancelled (soft delete) */
  cancelled: boolean;
  /** Trip creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Trip summary type returned by GET /api/trips
 * Used for dashboard display with minimal data
 */
export interface TripSummary {
  /** Unique trip identifier (UUID) */
  id: string;
  /** Trip name/title */
  name: string;
  /** Trip destination location */
  destination: string;
  /** Trip start date (ISO 8601 string, null if not set) */
  startDate: string | null;
  /** Trip end date (ISO 8601 string, null if not set) */
  endDate: string | null;
  /** Optional cover image URL */
  coverImageUrl: string | null;
  /** Theme preset ID */
  themeId: string | null;
  /** Font choice */
  themeFont: string | null;
  /** Whether the current user is an organizer of this trip */
  isOrganizer: boolean;
  /** Current user's RSVP status for this trip */
  rsvpStatus: "going" | "not_going" | "maybe" | "no_response";
  /** Summary info for trip organizers (for avatar display) */
  organizerInfo: Array<{
    /** Organizer's user ID */
    id: string;
    /** Organizer's display name */
    displayName: string;
    /** Organizer's profile photo URL */
    profilePhotoUrl: string | null;
  }>;
  /** Total number of trip members */
  memberCount: number;
  /** Total number of trip events */
  eventCount: number;
}

/**
 * Trip detail type returned by GET /api/trips/:id
 * Extends the base Trip type with organizers and member count
 */
export interface TripDetail extends Trip {
  /** Full organizer details including contact info */
  organizers: Array<{
    /** Organizer's user ID */
    id: string;
    /** Organizer's display name */
    displayName: string;
    /** Organizer's phone number */
    phoneNumber?: string;
    /** Organizer's profile photo URL */
    profilePhotoUrl: string | null;
    /** Organizer's IANA timezone */
    timezone: string | null;
  }>;
  /** Total number of trip members */
  memberCount: number;
}

/**
 * API response type for fetching trips list (cursor-based pagination)
 */
export interface GetTripsResponse {
  /** Whether the request was successful */
  success: true;
  /** Array of trip summaries */
  data: TripSummary[];
  /** Pagination metadata */
  meta: {
    /** Total number of trips */
    total: number;
    /** Number of items per page */
    limit: number;
    /** Whether more results exist beyond this page */
    hasMore: boolean;
    /** Opaque cursor for the next page, null if no more results */
    nextCursor: string | null;
  };
}

/**
 * API response type for fetching trip detail
 */
export interface GetTripResponse {
  /** Whether the request was successful */
  success: true;
  /** Detailed trip data */
  trip: TripDetail;
  /** Whether this is a preview response for non-Going members */
  isPreview?: boolean;
  /** Current user's RSVP status */
  userRsvpStatus?: "going" | "not_going" | "maybe" | "no_response";
  /** Whether current user is an organizer */
  isOrganizer?: boolean;
}

/**
 * API response type for trip creation
 */
export interface CreateTripResponse {
  /** Whether the request was successful */
  success: true;
  /** Created trip data */
  trip: Trip;
}

/**
 * API response type for trip update
 */
export interface UpdateTripResponse {
  /** Whether the request was successful */
  success: true;
  /** Updated trip data */
  trip: Trip;
}
