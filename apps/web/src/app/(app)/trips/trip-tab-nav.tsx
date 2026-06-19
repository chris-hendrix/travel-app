"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "itinerary", label: "Itinerary" },
  { value: "discover", label: "Discover" },
  { value: "messages", label: "Messages" },
  { value: "photos", label: "Photos" },
  { value: "settle", label: "Settle" },
] as const;

export function TripTabNav({ tripId }: { tripId: string }) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "itinerary";

  return (
    <div className="hidden md:flex mb-6 border-b border-border">
      <Tabs value={activeTab}>
        <TabsList variant="line">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              asChild
              className="text-base tracking-wide px-4 py-2"
            >
              <Link href={`/trips?id=${tripId}&tab=${tab.value}`}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
