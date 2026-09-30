import { useMemo } from "react";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { toMember } from "@/lib/mapping";
import type { Member } from "@/lib/members";
import { invitationKeys, type TripInvitationRow } from "@/lib/queries/invitations";
import { travelKeys } from "@/lib/queries/travel";
import { tripKeys } from "@/lib/queries/trips";
import type { GetMembersResponse } from "@journiful/shared/types";

/**
 * Why the people writes live here rather than in a `*Store.tsx`
 * provider: the other stores hold client state that needs a provider
 * (drafts, optimistic rows, a clock), the people hold none — the
 * roster and the invitations are server truth read through TanStack
 * Query, so plain writers plus mutation hooks suffice. This mirrors
 * the house pattern in `lib/queries/events.ts`, which already puts
 * write functions alongside `queryOptions`/`mutationOptions`
 * factories (a stronger justification than the plan's
 * accepted-as-risk). Do not lose `invalidateTripPeople`: its key set
 * spans four domains (members, invitations, travel, trips), and a
 * removal in one domain changes what the other three render.
 *
 * Deliberate difference from `lib/queries/events.ts`: the options
 * factories live there because the stores consume them, and the
 * people have no store, so the plain writer plus the hook is the
 * whole surface here.
 */

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

/**
 * One invalidation for a removal in the people domain: the roster,
 * the trip's invitations, the travel board and the trip's own counts
 * all change together, so every people write settles through this
 * single call rather than invalidating its own key alone.
 */
export async function invalidateTripPeople(
  queryClient: QueryClient,
  tripId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) }),
    queryClient.invalidateQueries({ queryKey: invitationKeys.trip(tripId) }),
    queryClient.invalidateQueries({ queryKey: travelKeys.list(tripId) }),
    queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
    queryClient.invalidateQueries({ queryKey: tripKeys.all }),
  ]);
}

/**
 * `DELETE /trips/:tripId/members/:memberId` (204, so `apiFetch`
 * resolves `undefined` and this resolves void). One verb removes both
 * a member and a guest: the app calls the members route for either
 * (the `DELETE /members/guests/:memberId` route keeps its place in
 * the API and stops being called by the app).
 */
export async function removeMember(
  tripId: string,
  memberId: string,
): Promise<void> {
  await apiFetch<unknown>(`/trips/${tripId}/members/${memberId}`, {
    method: "DELETE",
  });
}

/**
 * The remove half for a trip's roster: the row leaves
 * `memberKeys.list(tripId)` optimistically, comes back on error, and
 * the settle funnels through `invalidateTripPeople` so the roster,
 * the invitations, the travel board and the trip's own counts all go
 * stale together.
 */
export function useRemoveMember(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["members", "remove"],
    mutationFn: ({ memberId }: { memberId: string }) =>
      removeMember(tripId, memberId),
    onMutate: async (variables: { memberId: string }) => {
      await queryClient.cancelQueries({
        queryKey: memberKeys.list(tripId),
      });
      const previous = queryClient.getQueryData<Member[]>(
        memberKeys.list(tripId),
      );
      queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
        old ? old.filter((row) => row.id !== variables.memberId) : old,
      );
      return { previous };
    },
    onError: (
      _error: unknown,
      _variables: { memberId: string },
      context: { previous: Member[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Member[]>(
          memberKeys.list(tripId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      void invalidateTripPeople(queryClient, tripId);
    },
  });
}

/**
 * `DELETE /invitations/:id` (200 `{success: true}`, typed
 * `Promise<void>` — the row disappears on refetch, so the response
 * carries nothing the client keeps).
 */
export async function removeInvitation(id: string): Promise<void> {
  await apiFetch<{ success: true }>(`/invitations/${id}`, {
    method: "DELETE",
  });
}

/**
 * The invitee-remove half: the row leaves the trip's invitation list
 * (`invitationKeys.trip(tripId)`, reused from
 * `lib/queries/invitations.ts` rather than re-derived) optimistically,
 * comes back on error, and the settle funnels through
 * `invalidateTripPeople`.
 */
export function useRemoveInvitation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["members", "removeInvitation"],
    mutationFn: ({ id }: { id: string }) => removeInvitation(id),
    onMutate: async (variables: { id: string }) => {
      await queryClient.cancelQueries({
        queryKey: invitationKeys.trip(tripId),
      });
      const previous = queryClient.getQueryData<TripInvitationRow[]>(
        invitationKeys.trip(tripId),
      );
      queryClient.setQueryData<TripInvitationRow[]>(
        invitationKeys.trip(tripId),
        (old) => (old ? old.filter((row) => row.id !== variables.id) : old),
      );
      return { previous };
    },
    onError: (
      _error: unknown,
      _variables: { id: string },
      context: { previous: TripInvitationRow[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<TripInvitationRow[]>(
          invitationKeys.trip(tripId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      void invalidateTripPeople(queryClient, tripId);
    },
  });
}
