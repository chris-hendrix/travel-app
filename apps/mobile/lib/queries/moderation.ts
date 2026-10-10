/**
 * The moderation domain: the routes the roster row's panel and the blocked
 * list under it talk to, the one read that makes an unblock reachable, and
 * the settle every write funnels through.
 *
 * Why this is plain writers plus mutation hooks rather than a
 * `*Store.tsx` provider — the same reason `lib/queries/members.ts` gives
 * for the people writes: the moderation domain holds no client state that
 * needs a provider. A block and a report are the server's to record, and
 * the roster it changes is server truth read through TanStack Query, so a
 * writer plus a hook is the whole surface.
 *
 * **No optimistic removal.** `useRemoveMember` paints its row out of the
 * roster before the server answers because a deletion is the caller's own
 * decision about a row they own. A block is the server's decision: the
 * roster filter that hides the blocked pair is server-side, in both
 * directions, so the row has to come back from the server rather than be
 * taken away here. The block's confirmation *is* the next roster.
 *
 * The block's settle goes through `invalidateTripPeople` rather than its
 * own key, because a block changes two things at once: who the roster
 * shows (the folded pair disappears) and who is on the blocked list, whose
 * own key `moderationKeys.blocks()` names. Unblocking is the same route's
 * DELETE and the same settle, since it puts the row back. A report changes
 * nothing the roster shows, and it settles through the same call anyway:
 * one domain, one settle to read, rather than three writes that each
 * invalidate a subtly different set.
 *
 * **The blocked list's read is here too, and it is the only door to an
 * unblock.** The roster omits the blocked pair's rows in both directions
 * (server-side), so a person you have blocked has no row on the members
 * screen and no panel to open: an Unblock inside that panel would be a
 * control nothing can reach. `blockedUsersOptions` reads the list the
 * server keeps for exactly this, and it is a plain query rather than a
 * suspended one — it sits beside the roster, not in its gate.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { ReportReason } from "@journiful/shared/schemas";
import { apiFetch } from "@/lib/api";
import { invalidateTripPeople } from "@/lib/queries/members";

/** Key factory for the moderation domain: `all` / `blocks()`. */
export const moderationKeys = {
  all: ["moderation"] as const,
  /** The caller's own blocked list (`GET /blocks`, Task 35's read). */
  blocks: () => [...moderationKeys.all, "blocks"] as const,
};

/**
 * `POST /blocks` with `{ userId }` (201 `{success: true}`, so `apiFetch`
 * resolves the envelope and this resolves void). Idempotent server-side —
 * blocking somebody already blocked is also a 201, which is why a repeat
 * press needs no special case here.
 */
export async function blockUser(userId: string): Promise<void> {
  await apiFetch<{ success: true }>("/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

/**
 * `DELETE /blocks/:userId` (200 `{success: true}`). The unblock half of
 * the same decision, which is why the block is not `danger` in the UI:
 * this route is the undo, and it is idempotent server-side.
 */
export async function unblockUser(userId: string): Promise<void> {
  await apiFetch<{ success: true }>(`/blocks/${userId}`, {
    method: "DELETE",
  });
}

/** One row of the caller's blocked list: the account, and enough of the
 *  profile to draw the person without a second read. */
export type BlockedUserRow = {
  userId: string;
  displayName: string;
  profilePhotoUrl: string | null;
};

/**
 * Inline mirror of `blockedUsersResponseSchema`
 * (`shared/schemas/moderation.ts`): `{success: true, blocks}`. The envelope
 * is the transport's shape and stops at this module's own `select`, so no
 * caller renders one.
 */
type BlockedUsersResponse = { success: true; blocks: BlockedUserRow[] };

/**
 * `GET /blocks` (`apps/api/src/routes/moderation.routes.ts:50-56`, served
 * by `moderationController.listBlocked`): the people the caller has
 * blocked, with the display name and photo the roster row would have
 * drawn.
 *
 * The caller's own list, never a trip's, because a block is not a trip's:
 * the server filters the blocked pair on every trip the two share. That is
 * why this read hangs on `moderationKeys.blocks()` alone and takes no
 * tripId — a trip-scoped read would be the same rows fetched once per
 * trip.
 */
export const blockedUsersOptions = () =>
  queryOptions({
    queryKey: moderationKeys.blocks(),
    queryFn: () => apiFetch<BlockedUsersResponse>("/blocks"),
    // The rows, never the envelope: `{success, blocks}` is what the wire
    // says, and a screen has no business unwrapping a transport.
    select: (body) => body.blocks,
  });

/**
 * A report as this app files one. `tripId` is the trip it happened on and
 * is optional because a report outlives the trip; `note` is the reporter's
 * own words and is capped by `REPORT_NOTE_MAX` at the field.
 */
export type ReportUserRequest = {
  userId: string;
  tripId?: string | undefined;
  reason: ReportReason;
  note?: string | undefined;
};

/**
 * `POST /reports` with `{ userId, reason }` plus `tripId` and `note` when
 * they are present (201 `{success: true}`). Both optional keys are spread
 * in conditionally rather than sent as null: the API's schema takes them
 * as `.optional()`, so an absent trip and an empty note are the absence of
 * the key, not a null the server would have to read as one.
 */
export async function reportUser({
  userId,
  tripId,
  reason,
  note,
}: ReportUserRequest): Promise<void> {
  await apiFetch<{ success: true }>("/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      reason,
      ...(tripId === undefined ? null : { tripId }),
      ...(note === undefined ? null : { note }),
    }),
  });
}

/**
 * What one moderation write leaves stale: the trip's people (the roster
 * the row came from, and the trip's own counts beside it) and the caller's
 * blocked list. Both go stale together, so both are invalidated together
 * — see the module comment for why a report rides the same call.
 */
async function settleModeration(
  queryClient: QueryClient,
  tripId: string,
): Promise<void> {
  await Promise.all([
    invalidateTripPeople(queryClient, tripId),
    queryClient.invalidateQueries({ queryKey: moderationKeys.blocks() }),
  ]);
}

/**
 * The block half for a trip's roster. The row does not leave the cached
 * roster on its own: the invalidation is what makes the server's next
 * answer — with the pair filtered out — the one on screen, and until it
 * arrives the row is still the server's own row rather than a guess.
 */
export function useBlockUser(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["moderation", "block"],
    mutationFn: ({ userId }: { userId: string }) => blockUser(userId),
    onSuccess: () => settleModeration(queryClient, tripId),
  });
}

/**
 * The unblock half, for Task 35's blocked list. It invalidates the same
 * pair of keys for the same reason: unblocking puts a row back on the
 * roster and takes one off the list.
 */
export function useUnblockUser(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["moderation", "unblock"],
    mutationFn: ({ userId }: { userId: string }) => unblockUser(userId),
    onSuccess: () => settleModeration(queryClient, tripId),
  });
}

/**
 * The report half. `tripId` comes from the screen the panel was opened on
 * rather than from the variables, because the row behind it already knows
 * which trip this is; the note is passed through only when the writer
 * typed one.
 */
export function useReportUser(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["moderation", "report"],
    mutationFn: ({
      userId,
      reason,
      note,
    }: {
      userId: string;
      reason: ReportReason;
      note?: string | undefined;
    }) => reportUser({ userId, reason, tripId, note }),
    onSuccess: () => settleModeration(queryClient, tripId),
  });
}

/**
 * The read half for the caller's blocked list, and the only place the app
 * can offer an Unblock.
 *
 * Deliberately a plain `useQuery` and not `useSuspenseQuery`, unlike the
 * roster beside it: the members screen is already inside a `TripGate`, and
 * a secondary read must not be able to take the roster down with it. The
 * three states a caller could otherwise tell apart — still loading, failed,
 * nobody blocked — all render nothing at all, which is why this hands back
 * rows rather than a status union (`useStays`/`useTravel`'s shape, where
 * each state has something to draw).
 *
 * `retry: false` for the same reason: the client's policy retries a
 * NetworkError once, and a read that draws nothing has nothing to wait for.
 * One attempt, then it settles.
 */
export function useBlockedUsers(): { blocked: BlockedUserRow[] } {
  const { data } = useQuery({
    ...blockedUsersOptions(),
    retry: false,
  });
  return { blocked: data ?? [] };
}
