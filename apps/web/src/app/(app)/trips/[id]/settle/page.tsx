import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { serverApiRequest } from "@/lib/server-api";
import { SettleContent } from "./settle-content";
import type {
  GetTripResponse,
  GetPaymentsResponse,
  GetBalancesResponse,
} from "@journiful/shared/types";
import { tripKeys } from "@/hooks/trip-queries";
import { paymentKeys } from "@/hooks/payment-queries";
import { balanceKeys } from "@/hooks/balance-queries";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const response = await serverApiRequest<GetTripResponse>(`/trips/${id}`);
    return {
      title: `Settle — ${response.trip.name}`,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Settle", robots: { index: false, follow: false } };
  }
}

export default async function SettlePage({ params }: Props) {
  const { id } = await params;
  const queryClient = getQueryClient();

  // Prefetch trip, payments, and balances in parallel
  await Promise.allSettled([
    serverApiRequest<GetTripResponse>(`/trips/${id}`).then((response) => {
      queryClient.setQueryData(tripKeys.detail(id), {
        ...response.trip,
        isPreview: response.isPreview ?? false,
        userRsvpStatus: response.userRsvpStatus ?? "going",
        isOrganizer: response.isOrganizer ?? false,
      });
    }),
    serverApiRequest<GetPaymentsResponse>(`/trips/${id}/payments`).then(
      (response) => {
        queryClient.setQueryData(paymentKeys.list(id), response.payments);
      },
    ),
    serverApiRequest<GetBalancesResponse>(`/trips/${id}/balances`).then(
      (response) => {
        queryClient.setQueryData(balanceKeys.trip(id), response.balances);
      },
    ),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettleContent tripId={id} />
    </HydrationBoundary>
  );
}
