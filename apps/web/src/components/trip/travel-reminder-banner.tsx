"use client";

import { useState, useEffect } from "react";
import { Plane, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberTravels } from "@/hooks/use-member-travel";

interface TravelReminderBannerProps {
  tripId: string;
  memberId: string | undefined;
  onAddTravel: () => void;
}

function getDismissKey(tripId: string): string {
  return `tripful:onboarding-dismissed:${tripId}`;
}

export function TravelReminderBanner({
  tripId,
  memberId,
  onAddTravel,
}: TravelReminderBannerProps) {
  const { data: memberTravels } = useMemberTravels(tripId);
  const [dismissed, setDismissed] = useState(false);

  // Check localStorage for dismiss state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getDismissKey(tripId));
      if (stored === "true") {
        setDismissed(true);
      }
    } catch {
      // localStorage not available
    }
  }, [tripId]);

  // Check if current member has both arrival and departure entries
  const hasArrival = memberTravels?.some(
    (t) =>
      t.memberId === memberId && t.travelType === "arrival" && !t.deletedAt,
  );
  const hasDeparture = memberTravels?.some(
    (t) =>
      t.memberId === memberId && t.travelType === "departure" && !t.deletedAt,
  );

  // Don't render if member has both arrival and departure, banner dismissed, or memberId not available
  if ((hasArrival && hasDeparture) || dismissed || !memberId) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(getDismissKey(tripId), "true");
    } catch {
      // localStorage not available
    }
  };

  return (
    <div data-testid="travel-reminder-banner" className="mb-6">
      <div className="relative rounded-md border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
          <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
            <Plane className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Share your travel plans
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Let everyone know when you&apos;re arriving and departing so the
              group can plan accordingly.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <Button
                onClick={onAddTravel}
                variant="gradient"
                size="sm"
                className="rounded-md w-full sm:w-auto min-h-[44px]"
              >
                Add Travel Details
              </Button>
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="sm"
                className="rounded-md text-muted-foreground min-h-[44px]"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-2 shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-md focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
