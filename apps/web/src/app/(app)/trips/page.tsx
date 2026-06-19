import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { tripKeys } from "@/hooks/trip-queries";
import { serverApiRequest } from "@/lib/server-api";
import { TripsPageContainer } from "./trips-page-container";
import type { GetTripsResponse, GetTripResponse } from "@journiful/shared/types";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}): Promise<Metadata> {
  const { id } = (await searchParams) || {};
  if (!id) return { title: "My Trips" };
  try {
    const response = await serverApiRequest<GetTripResponse>(`/trips/${id}`);
    return {
      title: response.trip.name,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Trip", robots: { index: false, follow: false } };
  }
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = (await searchParams) || {};
  const queryClient = getQueryClient();

  // If an id is present, prefetch that trip's detail
  if (id) {
    try {
      const response = await serverApiRequest<GetTripResponse>(`/trips/${id}`);
      queryClient.setQueryData(tripKeys.detail(id), {
        ...response.trip,
        isPreview: response.isPreview ?? false,
        userRsvpStatus: response.userRsvpStatus ?? "going",
        isOrganizer: response.isOrganizer ?? false,
      });
    } catch {
      // Prefetch failed — client component will fetch on mount
    }
  }

  // Always prefetch the trips list (needed for sidebar navigation)
  try {
    const response = await serverApiRequest<GetTripsResponse>("/trips");
    queryClient.setQueryData(tripKeys.all, {
      pages: [response],
      pageParams: [undefined],
    });
  } catch {
    // Prefetch failed — client component will fetch on mount
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense>
        <TripsPageContainer id={id ?? null} />
      </Suspense>
    </HydrationBoundary>
  );
}
