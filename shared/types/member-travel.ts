/**
 * Member travel types and response interfaces
 */

/**
 * Member travel entity
 */
export interface MemberTravel {
  id: string;
  tripId: string;
  memberId: string;
  /** User ID of the member (populated by list endpoint via join) */
  userId?: string;
  travelType: "arrival" | "departure";
  time: Date;
  location: string | null;
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
