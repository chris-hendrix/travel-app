/**
 * Trips query options — the test seam for the wiring phase.
 *
 * Pattern to copy for every later `lib/queries/*.ts` module:
 * - Stub the network at the `@/lib/api` module boundary with
 *   `vi.mock("@/lib/api")`, then import the mocked `apiFetch` and
 *   assert it was called with the exact path (e.g. `"/trips"`).
 *   Prefer this over global `fetch` stubs: the base URL, timeout,
 *   auth header, and error shape all live in `lib/api.ts`, so
 *   queryFn tests should see only the path-level contract.
 * - Plain `queryFn()` tests call `options.queryFn!()` directly and
 *   need no React provider. Store-hook tests (e.g. `useTrips()`)
 *   DO need one: render the hook inside a test
 *   `QueryClientProvider` with a fresh `makeQueryClient()` from
 *   `@/lib/queries/client`, wrapped in `Suspense` (the hooks use
 *   `useSuspenseQuery`).
 */

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toTrip, toTripSummary } from "@/lib/mapping";
import type {
  CreateTripResponse,
  GetTripResponse,
  GetTripsResponse,
  UpdateTripResponse,
} from "@journiful/shared/types";

/** Key factory for the trips domain: `all` / `list` / `detail(id)`. */
export const tripKeys = {
  all: ["trips"] as const,
  list: () => [...tripKeys.all, "list"] as const,
  detail: (id: string) => [...tripKeys.all, "detail", id] as const,
};

/** List query: `GET /trips` mapped through `toTripSummary`. */
export const tripsListOptions = () =>
  queryOptions({
    queryKey: tripKeys.list(),
    queryFn: async () =>
      (await apiFetch<GetTripsResponse>("/trips")).data.map(toTripSummary),
  });

/** Detail query: `GET /trips/:id` mapped through `toTrip`. */
export const tripDetailOptions = (id: string) =>
  queryOptions({
    queryKey: tripKeys.detail(id),
    queryFn: async () =>
      toTrip((await apiFetch<GetTripResponse>(`/trips/${id}`)).trip),
  });

/**
 * Mirrors `createTripSchema`'s shape (`shared/schemas/trip.ts`):
 * `name`, `destination`, and `timezone` are required; dates and the
 * description ride along when the form collected them. zod is not a
 * mobile dep, so the shape is declared inline — the same precedent as
 * `requestCodeResponseSchema` in `lib/queries/auth.ts`.
 */
export type CreateTripRequest = {
  name: string;
  destination: string;
  timezone: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

/**
 * `POST /trips`, mapped through `toTrip`.
 *
 * The create endpoint returns the base trip entity (`CreateTripResponse`),
 * which carries no `memberCount` yet — the creator is the trip's sole
 * member at this point, so it maps as a one-member detail. Nullable
 * dates map defensively to `""` (the Task 4 convention), even though a
 * form-created trip always carries user-entered dates.
 */
export async function createTrip(input: CreateTripRequest) {
  const body = await apiFetch<CreateTripResponse>("/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return toTrip({ ...body.trip, memberCount: 1, organizers: [] });
}

/** Mutation wrapper for callers that fire `createTrip` via TanStack Query. */
export const createTripOptions = () =>
  mutationOptions({
    mutationKey: ["trips", "create"],
    mutationFn: createTrip,
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { createTripOptions as createTripMutation };

/**
 * Mirrors `updateTripSchema`'s shape (`shared/schemas/trip.ts` =
 * `baseTripSchema.partial()`): every field optional. The edit screen
 * sends `name`, `destination`, dates, and `description`; covers ride
 * the cover endpoints (Task 5), never this patch. zod is not a
 * mobile dep, so the shape is declared inline (Task 3 precedent).
 */
export type UpdateTripRequest = {
  name?: string;
  destination?: string;
  timezone?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  coverImageUrl?: string | null;
  allowMembersToAddEvents?: boolean;
  showAllMembers?: boolean;
};

/**
 * `PUT /trips/:id`, mapped through `toTrip`.
 *
 * The update endpoint returns the base trip entity
 * (`tripResponseSchema` in `shared/schemas/trip.ts`, served by
 * `PUT /:id` in `apps/api/src/routes/trip.routes.ts`) — like POST,
 * with no `memberCount`. It maps here as `going: 0`, a placeholder
 * the provider's `onSuccess` merge replaces with the cached count,
 * so the header and the roster can never disagree.
 */
export async function updateTrip(id: string, patch: UpdateTripRequest) {
  const body = await apiFetch<UpdateTripResponse>(`/trips/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return toTrip({ ...body.trip, memberCount: 0, organizers: [] });
}

/** Mutation wrapper for callers that fire `updateTrip` via TanStack Query. */
export const updateTripOptions = () =>
  mutationOptions({
    mutationKey: ["trips", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTripRequest }) =>
      updateTrip(id, patch),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateTripOptions as updateTripMutation };

function coverMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Build the multipart body for `POST /trips/:id/cover-image` from the
 * picker's URI. The URI is read into a blob first (the plan's
 * task-level fallback made primary): on Expo web the picker hands
 * back a `blob:` URI `fetch` resolves, and on native `fetch` resolves
 * `file://` URIs through the Expo networking stack. If that read
 * fails, fall back to the React Native `{uri, name, type}` file
 * object the native uploader accepts. The field name is `"file"`
 * (the web app's `image-upload.tsx` precedent; the controller reads
 * the first multipart file either way). Never set `Content-Type` —
 * `apiFetch` passes the `FormData` through untouched and the
 * boundary is generated at send time.
 */
export async function buildCoverFormData(uri: string): Promise<FormData> {
  const filename =
    uri.split("/").pop()?.split("?")[0]?.split("#")[0] || "cover.jpg";
  const form = new FormData();
  try {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, filename);
  } catch {
    form.append("file", {
      uri,
      name: filename,
      type: coverMime(filename),
    } as unknown as Blob);
  }
  return form;
}

/**
 * `POST /trips/:id/cover-image`, mapped through `toTrip`.
 *
 * Both cover endpoints return the base trip entity
 * (`tripResponseSchema` in `shared/schemas/trip.ts`, served by
 * `POST|DELETE /:id/cover-image` in
 * `apps/api/src/routes/trip.routes.ts`) — like PUT, with no
 * `memberCount`. It maps here as `going: 0`, a placeholder the
 * provider's `onSuccess` merge replaces with the cached count.
 */
export async function uploadCover(id: string, uri: string) {
  const body = await apiFetch<UpdateTripResponse>(
    `/trips/${id}/cover-image`,
    { method: "POST", body: await buildCoverFormData(uri) },
  );
  return toTrip({ ...body.trip, memberCount: 0, organizers: [] });
}

/** Mutation wrapper for callers that fire `uploadCover` via TanStack Query. */
export const uploadCoverOptions = () =>
  mutationOptions({
    mutationKey: ["trips", "uploadCover"],
    mutationFn: ({ id, uri }: { id: string; uri: string }) =>
      uploadCover(id, uri),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { uploadCoverOptions as uploadCoverMutation };

/**
 * `DELETE /trips/:id/cover-image`, mapped through `toTrip` — a nulled
 * `coverImageUrl` maps to `placeholderPhoto(trip.id)`, never a broken
 * box. Same `{success, trip}` response shape and `going: 0`
 * placeholder convention as `uploadCover`.
 */
export async function removeCover(id: string) {
  const body = await apiFetch<UpdateTripResponse>(
    `/trips/${id}/cover-image`,
    { method: "DELETE" },
  );
  return toTrip({ ...body.trip, memberCount: 0, organizers: [] });
}

/** Mutation wrapper for callers that fire `removeCover` via TanStack Query. */
export const removeCoverOptions = () =>
  mutationOptions({
    mutationKey: ["trips", "removeCover"],
    mutationFn: ({ id }: { id: string }) => removeCover(id),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { removeCoverOptions as removeCoverMutation };
