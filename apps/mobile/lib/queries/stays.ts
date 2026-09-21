import { mutationOptions, queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toStay } from "@/lib/mapping";
import { isOffline } from "@/lib/queries/errors";
import type { Stay } from "@/lib/stays";
import type { Accommodation } from "@journiful/shared/types";

/**
 * Inline mirror of `accommodationListResponseSchema`
 * (`shared/schemas/accommodation.ts`): `{success, accommodations}`.
 * zod is not a mobile dep, so the shape is declared inline (the
 * events/trips/auth/invitations precedent). The entity itself is the
 * shared `Accommodation` type.
 */
export type GetStaysResponse = {
  success: true;
  accommodations: Accommodation[];
};

/** Key factory for the stays domain: `all` / `list(tripId)`. */
export const stayKeys = {
  all: ["stays"] as const,
  list: (tripId: string) => [...stayKeys.all, "list", tripId] as const,
};

/**
 * Stays list query: `GET /trips/:tripId/accommodations`
 * (`apps/api/src/routes/accommodation.routes.ts:63`, served by
 * `accommodationController.listAccommodations`, response
 * `accommodationListResponseSchema`).
 *
 * Rows map through `toStay` (Phase 1 Task 4 — `address` stays the
 * address the driver is told, times pass through with `null` as the
 * untimed stay, `image`→`placeholderPhoto()` stub; relocation is
 * Phase 6 Task 5's job). No `includeDeleted` param is sent: the
 * endpoint defaults it off and there is no Deleted-items UI yet, so
 * the server returns live rows only. Ordering stays with the caller's
 * pure helper (`staysInOrder` in `lib/stays`), not the query — the
 * query preserves server order.
 */
export const staysOptions = (tripId: string) =>
  queryOptions({
    queryKey: stayKeys.list(tripId),
    queryFn: async (): Promise<Stay[]> =>
      (
        await apiFetch<GetStaysResponse>(`/trips/${tripId}/accommodations`)
      ).accommodations.map(toStay),
  });

/**
 * Inline mirror of `createAccommodationSchema`
 * (`shared/schemas/accommodation.ts`): `name` is the one required
 * field; `address`, `description`, `checkIn`, `checkOut`, and `links`
 * ride along when the form collected them (`checkOut` must be after
 * `checkIn` when both are present). zod is not a mobile dep, so the
 * shape is declared inline (the events Task 2 precedent).
 */
export type CreateStayRequest = {
  name: string;
  address?: string;
  addressLat?: number | null;
  addressLon?: number | null;
  description?: string;
  checkIn?: string;
  checkOut?: string;
  links?: Array<{ url: string; name?: string }>;
};

/**
 * Inline mirror of `updateAccommodationSchema`
 * (`shared/schemas/accommodation.ts` = `baseAccommodationSchema.partial()`):
 * every field optional, so an edit sends only what changed. The mobile
 * `Stay` translates at the call site in `lib/staysStore.tsx`.
 * zod is not a mobile dep, so the shape is declared inline.
 */
export type UpdateStayRequest = {
  name?: string;
  address?: string;
  addressLat?: number | null;
  addressLon?: number | null;
  description?: string;
  checkIn?: string;
  checkOut?: string;
  links?: Array<{ url: string; name?: string }>;
};

/**
 * `POST /trips/:tripId/accommodations`
 * (`apps/api/src/routes/accommodation.routes.ts:108`, body
 * `createAccommodationSchema`, 201 `accommodationResponseSchema`),
 * mapped through `toStay`.
 *
 * The response carries the full entity, so `toStay` needs nothing the
 * response does not have — unlike the trips writes, there is no
 * `memberCount`-style placeholder for the provider to merge. `image`
 * stays `placeholderPhoto(accommodation.id)`, deterministic per id.
 */
export async function createStay(tripId: string, input: CreateStayRequest) {
  const body = await apiFetch<{ success: true; accommodation: Accommodation }>(
    `/trips/${tripId}/accommodations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return toStay(body.accommodation);
}

/** Mutation wrapper for callers that fire `createStay` via TanStack Query. */
export const createStayOptions = () =>
  mutationOptions({
    mutationKey: ["stays", "create"],
    mutationFn: ({ tripId, input }: { tripId: string; input: CreateStayRequest }) =>
      createStay(tripId, input),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { createStayOptions as createStayMutation };

/**
 * `PUT /accommodations/:id`
 * (`apps/api/src/routes/accommodation.routes.ts:125`, body
 * `updateAccommodationSchema` = partial, so PATCH-like sends are legal;
 * 200 `accommodationResponseSchema`), mapped through `toStay` — same
 * full-entity response as create, so no placeholder merge.
 */
export async function updateStay(id: string, patch: UpdateStayRequest) {
  const body = await apiFetch<{ success: true; accommodation: Accommodation }>(
    `/accommodations/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  return toStay(body.accommodation);
}

/** Mutation wrapper for callers that fire `updateStay` via TanStack Query. */
export const updateStayOptions = () =>
  mutationOptions({
    mutationKey: ["stays", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: UpdateStayRequest }) =>
      updateStay(id, patch),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateStayOptions as updateStayMutation };

/**
 * `DELETE /accommodations/:id`
 * (`apps/api/src/routes/accommodation.routes.ts:142`) — soft
 * server-side, 200 `successResponseSchema` (`{success: true}` in
 * `shared/schemas/trip.ts:153`). Resolves void: after delete the
 * provider invalidates the list query and the row disappears on
 * refetch (`includeDeleted` stays off; no undelete UI yet — plan).
 */
export async function deleteStay(id: string): Promise<void> {
  await apiFetch<{ success: true }>(`/accommodations/${id}`, {
    method: "DELETE",
  });
}

/** Mutation wrapper for callers that fire `deleteStay` via TanStack Query. */
export const deleteStayOptions = () =>
  mutationOptions({
    mutationKey: ["stays", "delete"],
    mutationFn: ({ id }: { id: string }) => deleteStay(id),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { deleteStayOptions as deleteStayMutation };

export type StaysStatus = "loading" | "error" | "offline" | "success";

export function useStays(tripId: string | undefined): {
  stays: Stay[];
  status: StaysStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...staysOptions(tripId ?? ""),
    enabled,
  });
  const status: StaysStatus = !enabled || query.isPending
    ? "loading"
    : query.isError
      ? isOffline(query.error)
        ? "offline"
        : "error"
      : "success";
  return {
    stays: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}
