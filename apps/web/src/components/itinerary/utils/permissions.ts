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
): boolean {
  if (isLocked) return false;
  return isOrganizer || travel.userId === userId;
}
