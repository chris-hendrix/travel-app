import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { tripKeys } from "@/hooks/trip-queries";
import { serverApiRequest } from "@/lib/server-api";
import { TripDetailShell } from "./trip-detail-shell";
import type { GetTripResponse } from "@journiful/shared/types";

type Props = {
  params: Promise<{ id: string }>;
  children: ReactNode;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
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

export default async function TripLayout({ params, children }: Props) {
  const { id } = await params;
  const queryClient = getQueryClient();

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

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TripDetailShell tripId={id}>{children}</TripDetailShell>
    </HydrationBoundary>
  );
}
