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

import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toTrip, toTripSummary } from "@/lib/mapping";
import type { GetTripResponse, GetTripsResponse } from "@journiful/shared/types";

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
