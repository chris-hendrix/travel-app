import type { Event, Accommodation, MemberTravel } from "@journiful/shared/types";

export function canModifyEvent(
  event: Event,
  userId: string,
  isOrganizer: boolean,
  isLocked?: boolean,
): boolean {
  if (isLocked) return false;
  return isOrganizer || event.createdBy === userId;
}

export function canModifyAccommodation(
  accommodation: Accommodation,
  userId: string,
  isOrganizer: boolean,
  isLocked?: boolean,
): boolean {
  if (isLocked) return false;
  return isOrganizer || accommodation.createdBy === userId;
}

export function canModifyMemberTravel(
  travel: MemberTravel,
  userId: string,
  isOrganizer: boolean,
  isLocked?: boolean,
  currentMemberId?: string | null,
): boolean {
  if (isLocked) return false;
  // Organizers can edit any travel, including guest rows (guests have no
  // account so the memberId self-edit path below never applies to them).
  if (isOrganizer) return true;
  // Ownership is keyed by member.id (canonical person identity). Guests
  // (members with userId null) never match a caller, so only organizers
  // can edit guest rows.
  if (currentMemberId !== undefined) {
    return currentMemberId != null && travel.memberId === currentMemberId;
  }
  // Legacy fallback for callers that have not resolved the member row yet.
  const legacyUserId = (travel as unknown as { userId?: string }).userId;
  return legacyUserId !== undefined && legacyUserId === userId;
}
