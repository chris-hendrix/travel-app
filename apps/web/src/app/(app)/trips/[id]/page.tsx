import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TripDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/trips/${id}/itinerary`);
}
