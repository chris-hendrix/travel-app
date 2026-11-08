/**
 * Trip weather query: `GET /trips/:tripId/weather` (the 16-day
 * Open-Meteo forecast, 3 h server cache) read through TanStack Query
 * for the weather dialogs.
 *
 * Read-only: the domain has no writes, so there is no invalidation
 * surface — the one key goes stale on its own after 3 h.
 *
 * Node-importable by design: `react` and TanStack Query only, never
 * `react-native` (the `api.ts` precedent), so the plain-node Vitest
 * run stays clean.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { isOffline } from "@/lib/queries/errors";
import type { TripWeatherResponse } from "@journiful/shared/types";

/**
 * Inline mirror of the weather envelope: `{success, weather}`. zod is
 * not a mobile dep, so the shape is declared inline (the
 * events/trips/auth/invitations precedent). The entity itself is the
 * shared `TripWeatherResponse` type.
 */
export type GetTripWeatherResponse = {
  success: true;
  weather: TripWeatherResponse;
};

/**
 * Key factory for the weather domain. Callable as `weatherKeys(tripId)`
 * with the `all`/`detail` props attached, so both the direct call and
 * the trips-domain `tripKeys.detail(id)` spelling read.
 */
type WeatherKeys = {
  (tripId: string): readonly ["weather", "detail", string];
  all: readonly ["weather"];
  detail: (tripId: string) => readonly ["weather", "detail", string];
};

export const weatherKeys: WeatherKeys = Object.assign(
  (tripId: string) => ["weather", "detail", tripId] as const,
  {
    all: ["weather"] as const,
    detail: (tripId: string) => ["weather", "detail", tripId] as const,
  },
);

/** The trip's forecast: `GET /trips/:tripId/weather`, `weather` passed through. */
export const tripWeatherOptions = (tripId: string) =>
  queryOptions({
    queryKey: weatherKeys(tripId),
    queryFn: async (): Promise<TripWeatherResponse> =>
      (await apiFetch<GetTripWeatherResponse>(`/trips/${tripId}/weather`))
        .weather,
    staleTime: 3 * 60 * 60 * 1000,
  });

export type TripWeatherStatus = "loading" | "error" | "offline" | "success";

/**
 * The trip's forecast, in the section-hook shape
 * (`lib/queries/savedPlaces.ts`): `data` is undefined until the query
 * lands, `status` folds the offline case out of the error one, and
 * `retry` refetches. Disabled (loading) with no trip, never an error
 * flash.
 */
export function useTripWeather(tripId: string | undefined): {
  data: TripWeatherResponse | undefined;
  status: TripWeatherStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...tripWeatherOptions(tripId ?? ""),
    enabled,
  });
  const status: TripWeatherStatus =
    !enabled || query.isPending
      ? "loading"
      : query.isError
        ? isOffline(query.error)
          ? "offline"
          : "error"
        : "success";
  return {
    data: query.data,
    status,
    retry: () => {
      void query.refetch();
    },
  };
}
