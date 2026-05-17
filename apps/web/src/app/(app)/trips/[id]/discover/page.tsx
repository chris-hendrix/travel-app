"use client";

import { useParams } from "next/navigation";
import { DiscoverView } from "@/components/discover/discover-view";
import { useTripPage } from "../trip-page-context";

export default function DiscoverPage() {
  const params = useParams<{ id: string }>();
  const { temperatureUnit } = useTripPage();
  return <DiscoverView tripId={params.id} temperatureUnit={temperatureUnit} />;
}
