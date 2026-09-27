/**
 * Accommodation types and response interfaces
 */

import type { LinkItem } from "./link";
import type { PlaceSummary } from "./place";

/**
 * Accommodation entity
 */
export interface Accommodation {
  id: string;
  tripId: string;
  createdBy: string;
  name: string;
  address: string | null;
  addressLat: number | null;
  addressLon: number | null;
  description: string | null;
  checkIn: string | null;
  checkOut: string | null;
  links: LinkItem[] | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Resolved place summary; absent on rows constructed before the place read */
  place?: PlaceSummary | null;
  /** The picked place's name, stored on the row at pick time. The display source. */
  placeName?: string | null;
  /** The picked place's formatted address, stored on the row at pick time. */
  placeAddress?: string | null;
}

/**
 * API response for fetching multiple accommodations
 */
export interface GetAccommodationsResponse {
  success: true;
  accommodations: Accommodation[];
}

/**
 * API response for fetching a single accommodation
 */
export interface GetAccommodationResponse {
  success: true;
  accommodation: Accommodation;
}

/**
 * API response for creating an accommodation
 */
export interface CreateAccommodationResponse {
  success: true;
  accommodation: Accommodation;
}

/**
 * API response for updating an accommodation
 */
export interface UpdateAccommodationResponse {
  success: true;
  accommodation: Accommodation;
}

/**
 * API response for restoring an accommodation
 */
export interface RestoreAccommodationResponse {
  success: true;
  accommodation: Accommodation;
}
