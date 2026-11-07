import { useMemo } from "react";
import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { toSavedPlace } from "@/lib/mapping";
import { isOffline } from "@/lib/queries/errors";
import { membersOptions } from "@/lib/queries/members";
import {
  invalidateTripPlaces,
  savedPlaceKeys,
} from "@/lib/queries/savedPlaceKeys";
import { optimistically, rollBack } from "./optimistic";
import type { Member } from "@/lib/members";
import type { SavedPlace } from "@/lib/saved-places";
import type { EventType } from "@/lib/itinerary";
import type { SavedPlace as ApiSavedPlace } from "@journiful/shared/types";

/**
 * The saved places.
 *
 * No `*Store.tsx`, for the same reason the money holds none
 * (`lib/queries/payments.ts`'s module note): saved places hold no
 * client state a provider must own. They are server truth read through
 * TanStack Query, so plain writers plus mutation hooks are the whole
 * surface.
 *
 * Every write settles through `invalidateTripPlaces` — the trip's list
 * is the only read, so a write that invalidated its own key alone
 * would be the same call spelled longer.
 *
 * `savedPlaceKeys` and `invalidateTripPlaces` are **declared** in
 * `lib/queries/savedPlaceKeys.ts` and re-exported here, because the
 * people writes may one day invalidate the places too and cannot
 * import this module (`savedPlaceKeys.ts`'s module note). Every name
 * below was already public.
 */

export { invalidateTripPlaces, savedPlaceKeys };

/**
 * Inline mirror of `savedPlaceListResponseSchema`
 * (`shared/schemas/saved-place.ts`): `{success, savedPlaces}`. zod is
 * not a mobile dep, so the shape is declared inline (the
 * events/trips/auth/invitations precedent). The entity itself is the
 * shared `SavedPlace` type.
 */
export type GetSavedPlacesResponse = {
  success: true;
  savedPlaces: ApiSavedPlace[];
};

/**
 * The trip's saved places: `GET /trips/:tripId/saved-places`
 * (`apps/api/src/routes/saved-place.routes.ts:56`, response
 * `savedPlaceListResponseSchema`).
 *
 * Rows map through `toSavedPlace` with a blank `creatorName` — the
 * entity carries `createdBy` (a user id) and no name at all, so the
 * name is resolved per render off the cached roster in
 * `useSavedPlaces`, not here. The server supplies no order the client
 * may depend on, so the pinned lead is the reader's paint
 * (`pinLead`), not the array as it arrives.
 */
export const savedPlacesOptions = (tripId: string) =>
  queryOptions({
    queryKey: savedPlaceKeys.list(tripId),
    queryFn: async (): Promise<SavedPlace[]> =>
      (
        await apiFetch<GetSavedPlacesResponse>(
          `/trips/${tripId}/saved-places`,
        )
      ).savedPlaces.map((row) => toSavedPlace(row)),
  });

export type SavedPlacesStatus = "loading" | "error" | "offline" | "success";

/**
 * The trip's saved places, in the section-hook shape
 * (`lib/queries/payments.ts`).
 *
 * `creatorName` is a per-render map over the cached roster: the member
 * whose account saved the row names it (`member.userId ===
 * place.createdBy`), blank when the roster is cold or holds no row for
 * the saver — never a guessed id. The roster read subscribes through
 * `membersOptions`, so a roster that lands after the places still
 * fills the names in; when the trip screen already cached it, no
 * second fetch fires. "You" is the render's word, not this map's: the
 * sheet compares `createdBy` to `viewer.userId` (the same bargain
 * `ExpenseDetail` makes for the payer), because the query layer holds
 * no viewer identity.
 */
export function useSavedPlaces(tripId: string | undefined): {
  places: SavedPlace[];
  status: SavedPlacesStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...savedPlacesOptions(tripId ?? ""),
    enabled,
  });
  const rosterQuery = useQuery({
    ...membersOptions(tripId ?? ""),
    enabled,
  });
  const status: SavedPlacesStatus =
    !enabled || query.isPending
      ? "loading"
      : query.isError
        ? isOffline(query.error)
          ? "offline"
          : "error"
        : "success";
  const places = useMemo(() => {
    const roster = rosterQuery.data ?? [];
    return (query.data ?? []).map((place) => ({
      ...place,
      creatorName: creatorOf(roster, place.createdBy)?.name ?? "",
    }));
  }, [query.data, rosterQuery.data]);
  return {
    places,
    status,
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * Inline mirror of `createSavedPlaceSchema`
 * (`shared/schemas/saved-place.ts`): `name` is the one required field;
 * `address`, `description` and `placeType` ride along when the form
 * collected them, and the Google pair plus the picked snapshot strings
 * ride along when the row came from a suggestion. zod is not a mobile
 * dep, so the shape is declared inline (the events Task 2 precedent).
 *
 * A typed word carries no pair at all — no `placeId`, no provider, no
 * snapshot — which is what makes it typed.
 */
export type CreateSavedPlaceRequest = {
  name: string;
  address?: string | null;
  description?: string | null;
  placeType?: EventType;
  /** Google place pair — both or neither; absent for a typed word. */
  placeProvider?: "google" | null;
  placeId?: string | null;
  /** Picked-place snapshot strings — absent for a typed word. */
  placeName?: string | null;
  placeAddress?: string | null;
};

/** Every field optional: an edit sends only what changed. */
export type UpdateSavedPlaceRequest = Partial<CreateSavedPlaceRequest>;

/**
 * `POST /trips/:tripId/saved-places`
 * (`apps/api/src/routes/saved-place.routes.ts:86`, body
 * `createSavedPlaceSchema`, 201 `savedPlaceResponseSchema`), mapped
 * through `toSavedPlace`.
 *
 * Only the fields the caller hands over travel: a typed word sends its
 * name and nothing else, and the server defaults the type. A repeated
 * Google pair is a 409 `SAVED_PLACE_DUPLICATE` — the raw `ApiError`
 * propagates untouched, code-first, so the caller reads the code
 * (`isSavedPlaceDuplicate`) rather than unpicking a sentence.
 */
export async function createSavedPlace(
  tripId: string,
  input: CreateSavedPlaceRequest,
): Promise<SavedPlace> {
  const body: CreateSavedPlaceRequest = {
    name: input.name,
    ...(input.address !== undefined ? { address: input.address } : null),
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.placeType !== undefined ? { placeType: input.placeType } : null),
    ...(input.placeProvider !== undefined
      ? { placeProvider: input.placeProvider }
      : null),
    ...(input.placeId !== undefined ? { placeId: input.placeId } : null),
    ...(input.placeName !== undefined
      ? { placeName: input.placeName }
      : null),
    ...(input.placeAddress !== undefined
      ? { placeAddress: input.placeAddress }
      : null),
  };

  const response = await apiFetch<{ success: true; savedPlace: ApiSavedPlace }>(
    `/trips/${tripId}/saved-places`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return toSavedPlace(response.savedPlace);
}

/**
 * True for the already-saved 409 and only it. A repeated Google pair
 * is the one create failure the form answers in place (the duplicate
 * affordance), so the predicate — not a custom error class with a
 * sentence — is what names it. Mirrors `isGuestPhoneTaken`'s shape
 * without its wrapper: the `ApiError` already carries the code.
 */
export function isSavedPlaceDuplicate(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === "SAVED_PLACE_DUPLICATE"
  );
}

/**
 * `PUT /saved-places/:id`
 * (`apps/api/src/routes/saved-place.routes.ts:105`, body
 * `updateSavedPlaceSchema` = partial, so an edit sends only what
 * changed; 200 `savedPlaceResponseSchema`), mapped through
 * `toSavedPlace` — the same full-entity response as create, so no
 * placeholder merge.
 *
 * Clearing a link sends the pair (and the snapshot) as explicit nulls
 * — absent leaves the columns untouched, which is how the row keeps
 * what the edit did not name.
 */
export async function updateSavedPlace(
  savedPlaceId: string,
  input: UpdateSavedPlaceRequest,
): Promise<SavedPlace> {
  const body: UpdateSavedPlaceRequest = {
    ...(input.name !== undefined ? { name: input.name } : null),
    ...(input.address !== undefined ? { address: input.address } : null),
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.placeType !== undefined ? { placeType: input.placeType } : null),
    ...(input.placeProvider !== undefined
      ? { placeProvider: input.placeProvider }
      : null),
    ...(input.placeId !== undefined ? { placeId: input.placeId } : null),
    ...(input.placeName !== undefined
      ? { placeName: input.placeName }
      : null),
    ...(input.placeAddress !== undefined
      ? { placeAddress: input.placeAddress }
      : null),
  };

  const response = await apiFetch<{ success: true; savedPlace: ApiSavedPlace }>(
    `/saved-places/${savedPlaceId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return toSavedPlace(response.savedPlace);
}

/**
 * `DELETE /saved-places/:id`
 * (`apps/api/src/routes/saved-place.routes.ts:123`, 200
 * `{success: true}`). Resolves void: after delete the list query is
 * invalidated and the row disappears on refetch. A real delete
 * server-side, so the optimistic paint below is a removal and a second
 * delete is a 404.
 */
export async function deleteSavedPlace(savedPlaceId: string): Promise<void> {
  await apiFetch<{ success: true }>(`/saved-places/${savedPlaceId}`, {
    method: "DELETE",
  });
}

/**
 * The pin write in one verb: `pinned` true POSTs
 * `/saved-places/:id/pin` with `{pinned: true}`
 * (`apps/api/src/routes/saved-place.routes.ts:139`, 200
 * `savedPlaceResponseSchema`); false DELETEs
 * `/saved-places/:id/pin` (`:156`, same response). Both answer the
 * full entity, mapped through `toSavedPlace`.
 */
export async function setSavedPlacePinned(
  savedPlaceId: string,
  pinned: boolean,
): Promise<SavedPlace> {
  const response = await apiFetch<{ success: true; savedPlace: ApiSavedPlace }>(
    `/saved-places/${savedPlaceId}/pin`,
    pinned
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: true }),
        }
      : { method: "DELETE" },
  );

  return toSavedPlace(response.savedPlace);
}

/** Monotonic suffix so two temp cards minted in the same millisecond differ. */
let temporaryCounter = 0;

/**
 * The row painted into the list while the server is still writing.
 *
 * The creator is nobody yet: `createdBy` is the empty string on
 * purpose — it can never equal a real `viewer.userId`, so the
 * detail's `createdBy === viewer.userId` predicate cannot offer Edit
 * on a row that is not there (the payments precedent,
 * `lib/queries/payments.ts`). The per-render roster map in
 * `useSavedPlaces` reads it as blank until the settle swaps the
 * server's row in.
 *
 * The image stays null even for a linked pick: it is the server's
 * photo resolution, and painting a guess there would show a card that
 * is about to change under the reader (the events precedent —
 * `createEvent`'s "image stays null until the server photo lands").
 *
 * The id is time-based with a counter suffix, never derived from the
 * pair: a typed word carries no `placeId`, so a pair-derived key
 * would hand every placeless create the same temp id and the
 * settle-swap would trade them for each other.
 */
function temporarySavedPlace(
  tripId: string,
  input: CreateSavedPlaceRequest,
): SavedPlace {
  temporaryCounter += 1;
  return {
    id: `pending-${Date.now()}-${temporaryCounter}`,
    tripId,
    createdBy: "",
    creatorName: "",
    name: input.name,
    address: input.address ?? null,
    type: input.placeType ?? "misc",
    description: input.description ?? null,
    isPinned: false,
    createdAt: new Date().toISOString(),
    placeId: input.placeId ?? null,
    image: null,
    photoSourceUri: null,
    photoCredit: null,
  };
}

/**
 * The create half: a temporary card is painted into the list, swapped
 * for the server's row on success (the server assigns the real id),
 * and removed on failure. The settle funnels through
 * `invalidateTripPlaces`.
 */
export function useCreateSavedPlace(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSavedPlaceRequest) =>
      createSavedPlace(tripId, input),
    onMutate: async (input: CreateSavedPlaceRequest) => {
      const temporary = temporarySavedPlace(tripId, input);

      const context = await optimistically<SavedPlace>(
        queryClient,
        savedPlaceKeys.list(tripId),
        (rows) => [temporary, ...rows],
      );

      return { ...context, temporaryId: temporary.id };
    },
    onSuccess: (place: SavedPlace, _input, context) => {
      queryClient.setQueryData<SavedPlace[]>(
        savedPlaceKeys.list(tripId),
        (old) =>
          (old ?? []).map((row) =>
            row.id === context?.temporaryId ? place : row,
          ),
      );
    },
    onError: (_error: unknown, _input, context) =>
      rollBack<SavedPlace>(queryClient, savedPlaceKeys.list(tripId), context),
    onSettled: () => {
      void invalidateTripPlaces(queryClient, tripId);
    },
  });
}

/**
 * The fields an edit may repaint optimistically.
 *
 * The place-linked fields (`placeId`, `image`, `photoCredit`,
 * `photoSourceUri`) are deliberately absent: the request carries a
 * picked id at most, and the image is the server's photo resolution —
 * painting a new id beside the old photo would show a card that is
 * about to change under the reader, so the invalidation refetch is
 * left to bring them. The scalars are the request's own words, so the
 * card follows the edit at once.
 */
function patchFrom(input: UpdateSavedPlaceRequest): Partial<SavedPlace> {
  return {
    ...(input.name !== undefined ? { name: input.name } : null),
    ...(input.address !== undefined ? { address: input.address } : null),
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.placeType !== undefined ? { type: input.placeType } : null),
  };
}

/**
 * The edit half: the row is patched in place, and a failure restores
 * the list it replaced — the snapshot is taken and replayed for this
 * trip's key only, so a concurrent change to another key is never
 * reverted.
 */
export function useUpdateSavedPlace(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      savedPlaceId,
      input,
    }: {
      savedPlaceId: string;
      input: UpdateSavedPlaceRequest;
    }) => updateSavedPlace(savedPlaceId, input),
    onMutate: async ({
      savedPlaceId,
      input,
    }: {
      savedPlaceId: string;
      input: UpdateSavedPlaceRequest;
    }) =>
      optimistically<SavedPlace>(
        queryClient,
        savedPlaceKeys.list(tripId),
        (rows) =>
          rows.map((row) =>
            row.id === savedPlaceId
              ? { ...row, ...patchFrom(input) }
              : row,
          ),
      ),
    onError: (_error: unknown, _variables, context) =>
      rollBack<SavedPlace>(queryClient, savedPlaceKeys.list(tripId), context),
    onSettled: () => {
      void invalidateTripPlaces(queryClient, tripId);
    },
  });
}

/**
 * The delete half: the row leaves the list immediately, and a failure
 * puts it back.
 */
export function useDeleteSavedPlace(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ savedPlaceId }: { savedPlaceId: string }) =>
      deleteSavedPlace(savedPlaceId),
    onMutate: async ({ savedPlaceId }: { savedPlaceId: string }) =>
      optimistically<SavedPlace>(
        queryClient,
        savedPlaceKeys.list(tripId),
        (rows) => rows.filter((row) => row.id !== savedPlaceId),
      ),
    onError: (_error: unknown, _variables, context) =>
      rollBack<SavedPlace>(queryClient, savedPlaceKeys.list(tripId), context),
    onSettled: () => {
      void invalidateTripPlaces(queryClient, tripId);
    },
  });
}

/**
 * The pinned lead, as a stable partition: pinned cards first in the
 * order they already stood, then the rest untouched. No `pinnedAt`
 * exists on the wire to sort by (Task 5), so recency is not painted —
 * the flag flips and the card leads, and the refetch keeps whatever
 * order the server answers.
 */
function pinLead(rows: SavedPlace[]): SavedPlace[] {
  return [...rows.filter((row) => row.isPinned), ...rows.filter((row) => !row.isPinned)];
}

/**
 * The pin half, one hook for the sheet's toggle verb: `{pinned: true}`
 * POSTs the pin, `false` DELETEs it (`setSavedPlacePinned`).
 *
 * The paint flips the flag and leads the card at once, using only the
 * shared `optimistically`/`rollBack` pair — no new machinery. A
 * failure rolls the flag (and the order) back; success resolves to the
 * server's row in place, keeping the painted order; the settle funnels
 * through `invalidateTripPlaces`.
 *
 * The roster is read for the same reason the create paint reads it in
 * `lib/queries/payments.ts` — except there is nothing to read it for:
 * a pin changes no name, so unlike the money writes this hook touches
 * no roster cache at all.
 */
export function usePinSavedPlace(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      savedPlaceId,
      pinned,
    }: {
      savedPlaceId: string;
      pinned: boolean;
    }) => setSavedPlacePinned(savedPlaceId, pinned),
    onMutate: async ({
      savedPlaceId,
      pinned,
    }: {
      savedPlaceId: string;
      pinned: boolean;
    }) =>
      optimistically<SavedPlace>(
        queryClient,
        savedPlaceKeys.list(tripId),
        (rows) =>
          pinLead(
            rows.map((row) =>
              row.id === savedPlaceId ? { ...row, isPinned: pinned } : row,
            ),
          ),
      ),
    onSuccess: (place: SavedPlace) => {
      queryClient.setQueryData<SavedPlace[]>(
        savedPlaceKeys.list(tripId),
        (old) => (old ?? []).map((row) => (row.id === place.id ? place : row)),
      );
    },
    onError: (_error: unknown, _variables, context) =>
      rollBack<SavedPlace>(queryClient, savedPlaceKeys.list(tripId), context),
    onSettled: () => {
      void invalidateTripPlaces(queryClient, tripId);
    },
  });
}

/**
 * The roster half of the read, for callers that paint creator names
 * outside `useSavedPlaces`: the member whose account saved the row,
 * undefined when the roster is cold or holds no row for the saver.
 * "You" stays the render's word (`createdBy === viewer.userId`).
 */
export function creatorOf(
  roster: readonly Member[],
  createdBy: string,
): Member | undefined {
  return roster.find((member) => member.userId === createdBy);
}
