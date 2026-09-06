/**
 * Invitation and RSVP types and response interfaces
 */

/**
 * Invitation entity
 */
export interface Invitation {
  id: string;
  tripId: string;
  inviterId: string;
  inviteePhone: string;
  status: "pending" | "accepted" | "declined" | "failed";
  sentAt: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Member with profile information (for member list endpoint)
 */
export interface MemberWithProfile {
  id: string;
  /** Null for guest members (no attached user account); web derives isGuest from userId === null */
  userId: string | null;
  displayName: string;
  profilePhotoUrl: string | null;
  handles: Record<string, string> | null;
  /** Only included when requesting user is an organizer */
  phoneNumber?: string;
  /** Guest phone; only included when requesting user is an organizer and member is a guest */
  guestPhone?: string;
  status: "going" | "not_going" | "maybe" | "no_response";
  isOrganizer: boolean;
  /** Only included when requesting user is an organizer */
  isMuted?: boolean;
  sharePhone?: boolean;
  createdAt: string;
}

/**
 * API response for batch invitation creation
 */
export interface CreateInvitationsResponse {
  success: true;
  invitations: Invitation[];
  /** Members added via mutual invite (userId-based, added in Task 2.2) */
  addedMembers?: { userId: string; displayName: string }[];
  skipped: string[];
}

/**
 * API response for fetching invitations
 */
export interface GetInvitationsResponse {
  success: true;
  invitations: Invitation[];
}

/**
 * API response for RSVP status update
 */
export interface UpdateRsvpResponse {
  success: true;
  member: MemberWithProfile;
}

/**
 * API response for fetching trip members
 */
export interface GetMembersResponse {
  success: true;
  members: MemberWithProfile[];
}
