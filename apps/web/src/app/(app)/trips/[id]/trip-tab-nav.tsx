"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "itinerary", label: "Itinerary" },
  { value: "messages", label: "Messages" },
  { value: "photos", label: "Photos" },
  { value: "settle", label: "Settle" },
] as const;

export function TripTabNav({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const activeTab =
    TABS.find((t) => pathname.endsWith(t.value))?.value ?? "itinerary";

  return (
    <div className="hidden lg:flex mb-6 border-b border-border">
      <Tabs value={activeTab}>
        <TabsList variant="line">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              asChild
              className="text-base tracking-wide px-4 py-2"
            >
              <Link href={`/trips/${tripId}/${tab.value}`}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
