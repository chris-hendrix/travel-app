/**
 * Guest types and response interfaces
 */

/**
 * Guest entity
 */
export interface Guest {
  id: string;
  tripId: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * API response for fetching multiple guests
 */
export interface GetGuestsResponse {
  success: true;
  guests: Guest[];
}

/**
 * API response for fetching/creating/updating a single guest
 */
export interface GuestResponse {
  success: true;
  guest: Guest;
}
