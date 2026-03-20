import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { tripKeys } from "@/hooks/trip-queries";
import { serverApiRequest } from "@/lib/server-api";
import { TripsContent } from "./trips-content";
import type { GetTripsResponse } from "@journiful/shared/types";

export const metadata = { title: "My Trips" };

export default async function TripsPage() {
  const queryClient = getQueryClient();

  try {
    const response = await serverApiRequest<GetTripsResponse>("/trips");
    queryClient.setQueryData(tripKeys.all, {
      pages: [response],
      pageParams: [undefined],
    });
  } catch {
    // Prefetch failed (e.g., server-side cookie not available)
    // Client component will fetch on mount
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense>
        <TripsContent />
      </Suspense>
    </HydrationBoundary>
  );
}
