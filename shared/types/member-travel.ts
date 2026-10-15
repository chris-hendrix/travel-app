/**
 * Member travel types and response interfaces
 */

import type { TransportMode } from "../utils/travel";

/**
 * Member travel entity
 */
export interface MemberTravel {
  id: string;
  tripId: string;
  memberId: string;
  travelType: "arrival" | "departure";
  /**
   * How the leg is taken. Non-nullable, and required, because the column
   * is `NOT NULL DEFAULT 'flight'`: every row read back from the API
   * carries one, so no reader has to carry an "unknown" branch — which
   * is the state the feature went out of its way to avoid.
   */
  transportMode: TransportMode;
  departureLocation: string | null;
  departureTime: Date | null;
  arrivalLocation: string | null;
  arrivalTime: Date | null;
  details: string | null;
  flightNumber: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Display name of the member (populated by list endpoint via join) */
  memberName?: string;
}

/**
 * API response for fetching multiple member travels
 */
export interface GetMemberTravelsResponse {
  success: true;
  memberTravels: MemberTravel[];
}

/**
 * API response for fetching a single member travel
 */
export interface GetMemberTravelResponse {
  success: true;
  memberTravel: MemberTravel;
}

/**
 * API response for creating a member travel
 */
export interface CreateMemberTravelResponse {
  success: true;
  memberTravel: MemberTravel;
}

/**
 * API response for updating a member travel
 */
export interface UpdateMemberTravelResponse {
  success: true;
  memberTravel: MemberTravel;
}

/**
 * API response for restoring a member travel
 */
export interface RestoreMemberTravelResponse {
  success: true;
  memberTravel: MemberTravel;
}
