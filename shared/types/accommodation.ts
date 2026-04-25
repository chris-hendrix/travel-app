/**
 * Accommodation types and response interfaces
 */

import type { LinkItem } from "./link";

/**
 * Accommodation entity
 */
export interface Accommodation {
  id: string;
  tripId: string;
  createdBy: string;
  name: string;
  address: string | null;
  description: string | null;
  checkIn: string;
  checkOut: string;
  links: LinkItem[] | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
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
