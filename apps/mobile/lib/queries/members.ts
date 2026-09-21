import { useMemo } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { toMember } from "@/lib/mapping";
import type { Member } from "@/lib/members";
import type { GetMembersResponse } from "@journiful/shared/types";

/** Key factory for the members domain: `all` / `list(tripId)`. */
export const memberKeys = {
  all: ["members"] as const,
  list: (tripId: string) => [...memberKeys.all, "list", tripId] as const,
};

/**
 * Organizer-first, then server order. A sort rather than a
 * construction trick (the `membersFor` mock convention): the server
 * may return the roster in any order, so the client restores the
 * roll call's reading order after mapping.
 */
function sortOrganizerFirst(members: Member[]): Member[] {
  return [...members].sort(
    (a, b) => Number(b.isOrganizer) - Number(a.isOrganizer),
  );
}

/**
 * Roster query: `GET /trips/:tripId/members` mapped through
 * `toMember` (Phase 1 Task 4 — phone optional → `""`, organizer
 * flag, `sharePhone` default; phone visibility is server-side, so an
 * absent number maps to `""` rather than a guess).
 */
export const membersOptions = (tripId: string) =>
  queryOptions({
    queryKey: memberKeys.list(tripId),
    queryFn: async () =>
      sortOrganizerFirst(
        (
          await apiFetch<GetMembersResponse>(`/trips/${tripId}/members`)
        ).members.map(toMember),
      ),
  });

/**
 * The read half for a trip's roster: the list query, suspended until
 * it resolves. Mirrors `useTrip`'s absent-id branch — an absent id
 * names nothing, so the query rejects as a 404 without touching the
 * network and the gate answers with the not-found state.
 *
 * Every call site already sits under a `TripGate` Suspense boundary,
 * so no new gate is needed; the members read suspends alongside the
 * trip read it renders under.
 */
export function useMembers(tripId: string | undefined): {
  members: Member[];
} {
  const { data } = useSuspenseQuery({
    ...membersOptions(tripId ?? ""),
    queryFn: tripId
      ? membersOptions(tripId).queryFn
      : () => Promise.reject(new ApiError(404, "Not found")),
  });
  return useMemo(() => ({ members: data }), [data]);
}
