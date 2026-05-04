"use client";

import { useParams } from "next/navigation";
import { DiscoverView } from "@/components/discover/discover-view";

export default function DiscoverPage() {
  const params = useParams<{ id: string }>();
  return <DiscoverView tripId={params.id} />;
}
