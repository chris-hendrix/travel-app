import { mutationOptions, queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toTravel } from "@/lib/mapping";
import { isOffline } from "@/lib/queries/errors";
import type { MockTravel } from "@/mocks/travel";
import type { MemberTravel } from "@journiful/shared/types";
import type { TransportMode } from "@journiful/shared/utils";

/**
 * Inline mirror of `memberTravelListResponseSchema`
 * (`shared/schemas/member-travel.ts`): `{success, memberTravels}`.
 * zod is not a mobile dep, so the shape is declared inline (the
 * events/stays/trips/auth/invitations precedent). The entity itself is
 * the shared `MemberTravel` type, which carries the leg's
 * `transportMode` — a `NOT NULL` column, so it is on every row.
 * Times arrive as ISO strings on the wire (Fastify serializes the
 * `z.date()` columns); `toTravel` normalizes `Date | string` either way.
 */
export type GetTravelResponse = {
  success: true;
  memberTravels: MemberTravel[];
};

/** Key factory for the travel domain: `all` / `list(tripId)` / `locations`. */
export const travelKeys = {
  all: ["travel"] as const,
  list: (tripId: string) => [...travelKeys.all, "list", tripId] as const,
  locations: ["travel", "locations"] as const,
};

/**
 * Travel list query: `GET /trips/:tripId/member-travel`
 * (`apps/api/src/routes/member-travel.routes.ts:63`, served by
 * `memberTravelController.listMemberTravel`, response
 * `memberTravelListResponseSchema`).
 *
 * Rows map through `toTravel` (Phase 1 Task 4 — both ends of the leg,
 * `memberName` from the list join, `deletedAt` pass-through). No
 * `includeDeleted` param is sent: the endpoint defaults it off and
 * there is no Deleted-items UI yet, so the server returns live rows
 * only. Ordering stays with the caller's pure helper (`travelBoard` in
 * `lib/travelBoard`), not the query — the query preserves server order.
 */
export const travelOptions = (tripId: string) =>
  queryOptions({
    queryKey: travelKeys.list(tripId),
    queryFn: async (): Promise<MockTravel[]> =>
      (
        await apiFetch<GetTravelResponse>(`/trips/${tripId}/member-travel`)
      ).memberTravels.map(toTravel),
  });

/**
 * Inline mirror of `createMemberTravelSchema`
 * (`shared/schemas/member-travel.ts`): `travelType` is required, plus
 * the pertinent time for its direction (arrival → `arrivalTime`,
 * departure → `departureTime` — the server refines on it). `memberId`
 * rides along when the organizer files for someone else. zod is not a
 * mobile dep, so the shape is declared inline (the stays Task 3
 * precedent).
 *
 * `transportMode` is optional on the wire — the column's own default is
 * the only default — but this client always sends it (the record it
 * builds always carries one), and a body without a mode must never be
 * able to reset a row that already has one.
 */
export type CreateTravelRequest = {
  travelType: "arrival" | "departure";
  memberId?: string;
  transportMode?: TransportMode;
  departureLocation?: string | null;
  departureTime?: string;
  arrivalLocation?: string | null;
  arrivalTime?: string;
  details?: string | null;
  flightNumber?: string | null;
};

/**
 * Inline mirror of `updateMemberTravelSchema`
 * (`shared/schemas/member-travel.ts` = `baseMemberTravelSchema
 * .omit({ travelType: true }).partial()`): every field optional, so an
 * edit sends only what changed, and no `travelType` — a direction is
 * create-only, exactly like `memberId`, because changing it would put a
 * second live row on the pair the feature is built around (the API
 * strips the key if it is sent anyway). `transportMode` is the one field
 * that is *not* like `travelType`: how the leg is taken is editable, so
 * an edit that carries a mode changes it. zod is not a mobile dep, so the
 * shape is declared inline.
 */
export type UpdateTravelRequest = {
  transportMode?: TransportMode;
  departureLocation?: string | null;
  departureTime?: string;
  arrivalLocation?: string | null;
  arrivalTime?: string;
  details?: string | null;
  flightNumber?: string | null;
};

/**
 * `POST /trips/:tripId/member-travel`
 * (`apps/api/src/routes/member-travel.routes.ts:108`, body
 * `createMemberTravelSchema`, response `memberTravelResponseSchema` on
 * **200 or 201** — 201 when this call filed a new row, 200 when the member
 * and direction already held one and it was updated in place), mapped
 * through `toTravel`.
 *
 * The response carries the full entity, so `toTravel` needs nothing
 * the response does not have — same full-entity shape as the stays
 * writes, no placeholder merge.
 */
export async function createTravel(tripId: string, input: CreateTravelRequest) {
  const body = await apiFetch<{ success: true; memberTravel: MemberTravel }>(
    `/trips/${tripId}/member-travel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return toTravel(body.memberTravel);
}

/** Mutation wrapper for callers that fire `createTravel` via TanStack Query. */
export const createTravelOptions = () =>
  mutationOptions({
    mutationKey: ["travel", "create"],
    mutationFn: ({ tripId, input }: { tripId: string; input: CreateTravelRequest }) =>
      createTravel(tripId, input),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { createTravelOptions as createTravelMutation };

/**
 * `PUT /member-travel/:id`
 * (`apps/api/src/routes/member-travel.routes.ts:125`, body
 * `updateMemberTravelSchema` = partial, so PATCH-like sends are legal;
 * 200 `memberTravelResponseSchema`), mapped through `toTravel` — same
 * full-entity response as create, so no placeholder merge.
 */
export async function updateTravel(id: string, patch: UpdateTravelRequest) {
  const body = await apiFetch<{ success: true; memberTravel: MemberTravel }>(
    `/member-travel/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  return toTravel(body.memberTravel);
}

/** Mutation wrapper for callers that fire `updateTravel` via TanStack Query. */
export const updateTravelOptions = () =>
  mutationOptions({
    mutationKey: ["travel", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTravelRequest }) =>
      updateTravel(id, patch),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateTravelOptions as updateTravelMutation };

/**
 * `DELETE /member-travel/:id`
 * (`apps/api/src/routes/member-travel.routes.ts:142`) — soft
 * server-side, 200 `successResponseSchema` (`{success: true}` in
 * `shared/schemas/trip.ts:153`). Resolves void: after delete the
 * provider invalidates the list query and the row disappears on
 * refetch (`includeDeleted` stays off; no undelete UI yet — plan).
 */
export async function deleteTravel(id: string): Promise<void> {
  await apiFetch<{ success: true }>(`/member-travel/${id}`, {
    method: "DELETE",
  });
}

/** Mutation wrapper for callers that fire `deleteTravel` via TanStack Query. */
export const deleteTravelOptions = () =>
  mutationOptions({
    mutationKey: ["travel", "delete"],
    mutationFn: ({ id }: { id: string }) => deleteTravel(id),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { deleteTravelOptions as deleteTravelMutation };

export type TravelStatus = "loading" | "error" | "offline" | "success";

/**
 * Explicit section state for a read that fills a section (the plan's
 * tiering rule — the `useEvents`/`useStays` shape): `loading` while
 * pending, `offline` when the request never reached the server, `error`
 * for anything else that rejected, `success` with the mapped rows.
 * `retry` refetches. An absent id names nothing, so the query stays
 * disabled and the section reads loading rather than flashing an error.
 *
 * Plain `useQuery`, never Suspense: the trip header is the screen gate,
 * and the travel board loads independently under the rendered header.
 * Domain-named `travel` (not `travels`): one member's record is already
 * "travel", and the board reads rows, not a count.
 */
export function useTravel(tripId: string | undefined): {
  travel: MockTravel[];
  status: TravelStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...travelOptions(tripId ?? ""),
    enabled,
  });
  const status: TravelStatus = !enabled || query.isPending
    ? "loading"
    : query.isError
      ? isOffline(query.error)
        ? "offline"
        : "error"
      : "success";
  return {
    travel: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * Inline mirror of `myTravelLocationsResponseSchema`
 * (`shared/schemas/member-travel.ts`): `{success, locations}` — the
 * caller's own travel wheres across trips, strings only. zod is not a
 * mobile dep, so the shape is declared inline (the `GetTravelResponse`
 * precedent above).
 */
export type GetMyLocationsResponse = {
  success: true;
  locations: string[];
};

/**
 * `GET /member-travel/locations`
 * (`apps/api/src/routes/member-travel.routes.ts`, served by
 * `memberTravelController.getMyLocations`, response
 * `myTravelLocationsResponseSchema`).
 *
 * Cross-trip by design: the endpoint carries no trip id, because the
 * answer is about the person, not the trip they are filing for — the
 * airport they flew into last time is the one they want suggested now.
 */
export const myLocationsOptions = () =>
  queryOptions({
    queryKey: travelKeys.locations,
    queryFn: async (): Promise<string[]> =>
      (await apiFetch<GetMyLocationsResponse>("/member-travel/locations"))
        .locations,
  });

/**
 * Section state for the `Where` field's cross-trip source. Same shape as
 * `useTravel` above — `loading` / `offline` / `error` / `success`, with
 * `retry` — so a caller can read it the same way.
 *
 * The travel form reads only `locations`, and that is deliberate: this
 * list is an enrichment of a field that already works without it (this
 * trip's own wheres and the trip's destination), so a failed or absent
 * read narrows the suggestions rather than blocking the form. Two
 * sources of truth for one screen's readiness would make a Places-free
 * field the reason a form will not open.
 */
export function useMyTravelLocations(): {
  locations: string[];
  status: TravelStatus;
  retry: () => void;
} {
  const query = useQuery(myLocationsOptions());
  const status: TravelStatus = query.isPending
    ? "loading"
    : query.isError
      ? isOffline(query.error)
        ? "offline"
        : "error"
      : "success";
  return {
    locations: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}
