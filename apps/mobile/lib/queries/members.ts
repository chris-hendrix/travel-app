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
import { invitationKeys, invite, type TripInvitationRow } from "@/lib/queries/invitations";
import { travelKeys } from "@/lib/queries/travel";
import { tripKeys } from "@/lib/queries/trips";
import type { GetMembersResponse, MemberWithProfile } from "@journiful/shared/types";

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
 * Inline mirror of `createGuestSchema` (`shared/schemas/invitation.ts`):
 * `displayName` is required, `guestPhone` is the optional E.164 number.
 * zod is not a mobile dep, so the shape is declared inline (the
 * trips/auth/invitations precedent).
 */
export type CreateGuestRequest = {
  displayName: string;
  guestPhone?: string;
};

/**
 * Inline mirror of `updateGuestSchema` (the same shape `.partial()` plus
 * an organizer-settable guest `status`): every field optional, so an
 * edit sends only what changed. The mobile `Member` names (`name`,
 * `phone`) translate to the API names (`displayName`, `guestPhone`) at
 * this boundary, never at the call site.
 */
export type UpdateGuestRequest = {
  displayName?: string;
  guestPhone?: string;
  status?: Member["status"];
};

/**
 * A phone that is already on the trip. `createGuest`/`updateGuest` throw
 * this instead of the raw 409 `DUPLICATE_MEMBER` `ApiError`, so the
 * caller can point the form at the phone field rather than rendering a
 * generic failure. `cause` keeps the original `ApiError`; `field` names
 * the form field at fault.
 */
export class GuestPhoneTakenError extends Error {
  field = "guestPhone" as const;
  constructor(
    message = "That number is already on this trip",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GuestPhoneTakenError";
  }
}

/** True for the phone-field error above (and only it). */
export function isGuestPhoneTaken(error: unknown): boolean {
  return error instanceof GuestPhoneTakenError;
}

function throwIfDuplicateGuestPhone(error: unknown): never | void {
  if (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === "DUPLICATE_MEMBER"
  ) {
    throw new GuestPhoneTakenError(undefined, { cause: error });
  }
}

/**
 * `POST /trips/:tripId/members/guests` (201 `{success: true, member}`,
 * the guest row), mapped through `toMember` — `displayName`→`name`, the
 * guest number lands on both `phone` and `guestPhone`, `userId` stays
 * null. A 409 `DUPLICATE_MEMBER` surfaces as `GuestPhoneTakenError`.
 */
export async function createGuest(
  tripId: string,
  input: CreateGuestRequest,
): Promise<Member> {
  try {
    const body = await apiFetch<{
      success: true;
      member: MemberWithProfile;
    }>(`/trips/${tripId}/members/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return toMember(body.member);
  } catch (error) {
    throwIfDuplicateGuestPhone(error);
    throw error;
  }
}

/**
 * The guest-create half: the server row joins `memberKeys.list(tripId)`
 * on success (no optimistic row — the server assigns the id), and the
 * settle funnels through `invalidateTripPeople`.
 */
export function useCreateGuest(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["members", "createGuest"],
    mutationFn: (input: CreateGuestRequest) => createGuest(tripId, input),
    onSuccess: (guest: Member) => {
      queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
        old ? [...old, guest] : [guest],
      );
    },
    onSettled: () => {
      void invalidateTripPeople(queryClient, tripId);
    },
  });
}

/**
 * `PATCH /trips/:tripId/members/guests/:memberId` (200
 * `{success: true, member}`), mapped through `toMember`. A 409
 * `DUPLICATE_MEMBER` surfaces as `GuestPhoneTakenError`, same as create.
 */
export async function updateGuest(
  tripId: string,
  memberId: string,
  patch: UpdateGuestRequest,
): Promise<Member> {
  try {
    const body = await apiFetch<{
      success: true;
      member: MemberWithProfile;
    }>(`/trips/${tripId}/members/guests/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return toMember(body.member);
  } catch (error) {
    throwIfDuplicateGuestPhone(error);
    throw error;
  }
}

/** The API names for an `UpdateGuestRequest`, for the optimistic paint. */
function paintGuestPatch(row: Member, patch: UpdateGuestRequest): Member {
  return {
    ...row,
    name: patch.displayName ?? row.name,
    phone: patch.guestPhone ?? row.phone,
    guestPhone: patch.guestPhone ?? row.guestPhone,
    status: patch.status ?? row.status,
  };
}

/**
 * The guest-update half: the roster row paints the patch optimistically,
 * rolls back to the snapshot on error, resolves to the server row on
 * success, and the settle funnels through `invalidateTripPeople`.
 */
export function useUpdateGuest(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["members", "updateGuest"],
    mutationFn: ({
      memberId,
      patch,
    }: {
      memberId: string;
      patch: UpdateGuestRequest;
    }) => updateGuest(tripId, memberId, patch),
    onMutate: async (variables: {
      memberId: string;
      patch: UpdateGuestRequest;
    }) => {
      await queryClient.cancelQueries({
        queryKey: memberKeys.list(tripId),
      });
      const previous = queryClient.getQueryData<Member[]>(
        memberKeys.list(tripId),
      );
      queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
        old
          ? old.map((row) =>
              row.id === variables.memberId
                ? paintGuestPatch(row, variables.patch)
                : row,
            )
          : old,
      );
      return { previous };
    },
    onError: (
      _error: unknown,
      _variables: { memberId: string; patch: UpdateGuestRequest },
      context: { previous: Member[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Member[]>(
          memberKeys.list(tripId),
          context.previous,
        );
      }
    },
    onSuccess: (guest: Member) => {
      queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
        old
          ? old.map((row) => (row.id === guest.id ? guest : row))
          : old,
      );
    },
    onSettled: () => {
      void invalidateTripPeople(queryClient, tripId);
    },
  });
}

/**
 * Which half of a guest invite failed. The PATCH half (`updateGuest`)
 * and the invitation half (`invite()`) fail for different reasons and
 * point at different UI — the phone field versus the send action — so
 * the hook wraps either failure with the stage that names it. `cause`
 * keeps the original error (a `GuestPhoneTakenError` for a taken
 * number, the `ApiError` for a failed POST).
 */
export class InviteGuestError extends Error {
  stage: "phone" | "invite";
  constructor(stage: "phone" | "invite", message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InviteGuestError";
    this.stage = stage;
  }
}

/**
 * The guest-invite half: a changed phone is PATCHed first (reusing
 * `updateGuest` from Task 10 — never a second PATCH of its own) and
 * the invitation POSTed second (reusing `invite()` from
 * `lib/queries/invitations.ts` — never a second invitation POST). An
 * unchanged phone skips the PATCH entirely. The saved phone is written
 * into `memberKeys.list(tripId)` as soon as the PATCH succeeds, so a
 * failed POST keeps the saved phone and reports `stage: "invite"`
 * rather than rolling anything back. The settle funnels through
 * `invalidateTripPeople`.
 */
export function useInviteGuest(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["members", "inviteGuest"],
    mutationFn: async ({
      memberId,
      phone,
    }: {
      memberId: string;
      phone: string;
    }) => {
      const current = queryClient
        .getQueryData<Member[]>(memberKeys.list(tripId))
        ?.find((row) => row.id === memberId);
      const currentPhone = current
        ? (current.guestPhone ?? current.phone)
        : undefined;
      if (currentPhone === undefined || currentPhone !== phone) {
        let saved: Member;
        try {
          saved = await updateGuest(tripId, memberId, { guestPhone: phone });
        } catch (error) {
          throw new InviteGuestError("phone", "Failed to save the number", {
            cause: error,
          });
        }
        queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
          old
            ? old.map((row) => (row.id === memberId ? saved : row))
            : old,
        );
      }
      try {
        return await invite(tripId, phone);
      } catch (error) {
        throw new InviteGuestError("invite", "Failed to send the invitation", {
          cause: error,
        });
      }
    },
    onSettled: () => {
      void invalidateTripPeople(queryClient, tripId);
    },
  });
}

/**
 * Whether a roster row can change role. A guest row (`userId` null)
 * never can — guests are never organizers (enforced server-side in
 * `updateMemberRole`), so the action set offers them no role at all.
 * Pinned here as a pure helper rather than in a render, so Task 13's
 * action set reads the rule instead of re-deriving it.
 */
export function canChangeMemberRole(member: Member): boolean {
  return member.userId !== null;
}

/**
 * `PATCH /trips/:tripId/members/:memberId` with `{ isOrganizer }`
 * (`apps/api/src/routes/trip.routes.ts:220`, body
 * `updateMemberRoleSchema`, 200 `updateRsvpResponseSchema` carrying the
 * member), mapped through `toMember`.
 */
export async function setOrganizer(
  tripId: string,
  memberId: string,
  isOrganizer: boolean,
): Promise<Member> {
  const body = await apiFetch<{
    success: true;
    member: MemberWithProfile;
  }>(`/trips/${tripId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isOrganizer }),
  });
  return toMember(body.member);
}

/**
 * The role half: the flag flips optimistically in
 * `memberKeys.list(tripId)`, rolls back to the snapshot on error,
 * resolves to the server row on success, and the settle funnels through
 * `invalidateTripPeople`.
 */
export function useSetOrganizer(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["members", "setOrganizer"],
    mutationFn: ({
      memberId,
      isOrganizer,
    }: {
      memberId: string;
      isOrganizer: boolean;
    }) => setOrganizer(tripId, memberId, isOrganizer),
    onMutate: async (variables: {
      memberId: string;
      isOrganizer: boolean;
    }) => {
      await queryClient.cancelQueries({
        queryKey: memberKeys.list(tripId),
      });
      const previous = queryClient.getQueryData<Member[]>(
        memberKeys.list(tripId),
      );
      queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
        old
          ? old.map((row) =>
              row.id === variables.memberId
                ? { ...row, isOrganizer: variables.isOrganizer }
                : row,
            )
          : old,
      );
      return { previous };
    },
    onError: (
      _error: unknown,
      _variables: { memberId: string; isOrganizer: boolean },
      context: { previous: Member[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Member[]>(
          memberKeys.list(tripId),
          context.previous,
        );
      }
    },
    onSuccess: (member: Member) => {
      queryClient.setQueryData<Member[]>(memberKeys.list(tripId), (old) =>
        old
          ? old.map((row) => (row.id === member.id ? member : row))
          : old,
      );
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
