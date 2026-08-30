"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { useMembers } from "@/hooks/use-invitations";

/**
 * Resolves the current user's member ID within a trip.
 *
 * Payments are keyed by `memberId` (not `userId`), so "You" detection in
 * settle lists must compare member ids. Returns `undefined` when the user is
 * signed out, is not a member of the trip, or members are still loading.
 *
 * @param tripId - The ID of the trip to resolve membership for
 * @returns The current user's member id for the trip, or `undefined`
 */
export function useCurrentMemberId(tripId: string): string | undefined {
  const { user } = useAuth();
  const { data: members } = useMembers(tripId);
  return members?.find((m) => m.userId === user?.id)?.id;
}
