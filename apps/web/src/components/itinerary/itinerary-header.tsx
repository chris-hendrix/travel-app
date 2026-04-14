"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Car, Globe, PlaneLanding, Plus, Building2, Utensils, type LucideIcon } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { useMemberTravels } from "@/hooks/use-member-travel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CreateEventDialog } from "./create-event-dialog";
import { CreateAccommodationDialog } from "./create-accommodation-dialog";
import { CreateMemberTravelDialog } from "./create-member-travel-dialog";

export type ItineraryFilter = "all" | "activity" | "meal" | "travel" | "members";

function getTimezoneAbbr(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
}

const FILTER_OPTIONS: { value: ItineraryFilter; label: string; icon?: LucideIcon }[] = [
  { value: "all", label: "All" },
  { value: "activity", label: "Activity", icon: Calendar },
  { value: "meal", label: "Meal", icon: Utensils },
  { value: "travel", label: "Travel", icon: Car },
  { value: "members", label: "Members", icon: PlaneLanding },
];

interface ItineraryHeaderProps {
  filter: ItineraryFilter;
  onFilterChange: (filter: ItineraryFilter) => void;
  selectedTimezone: string;
  onTimezoneChange: (tz: string) => void;
  tripTimezone: string;
  userTimezone: string;
  tripId: string;
  isOrganizer: boolean;
  isMember: boolean;
  allowMembersToAddEvents: boolean;
  isLocked?: boolean;
  hideFab?: boolean;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function ItineraryHeader({
  filter,
  onFilterChange,
  selectedTimezone,
  onTimezoneChange,
  tripTimezone,
  userTimezone,
  tripId,
  isOrganizer,
  isMember,
  allowMembersToAddEvents,
  isLocked,
  hideFab,
  tripStartDate,
  tripEndDate,
}: ItineraryHeaderProps) {
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isCreateAccommodationOpen, setIsCreateAccommodationOpen] =
    useState(false);
  const [isCreateMemberTravelOpen, setIsCreateMemberTravelOpen] =
    useState(false);
  const { data: memberTravels } = useMemberTravels(tripId);

  const [fabOpen, setFabOpen] = useState(false);
  const mounted = useMounted();

  const showTzToggle = tripTimezone !== userTimezone;
  const isTripTz = selectedTimezone === tripTimezone;
  const tzAbbr = useMemo(() => getTimezoneAbbr(selectedTimezone), [selectedTimezone]);

  // Permission checks
  const canAddEvent = isOrganizer || (isMember && allowMembersToAddEvents);
  const hasAnyAction = canAddEvent || isOrganizer || isMember;

  return (
    <>
      <div
        data-testid="itinerary-header"
        className="bg-background border-b border-border py-2 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onFilterChange(opt.value)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer",
                    filter === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  {opt.icon ? (
                    <opt.icon className="w-3.5 h-3.5" />
                  ) : (
                    opt.label
                  )}
                </button>
              ))}
            </div>

            {/* Timezone toggle */}
            {showTzToggle && (
              <button
                type="button"
                onClick={() =>
                  onTimezoneChange(isTripTz ? userTimezone : tripTimezone)
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0 cursor-pointer"
                aria-label={`Switch to ${isTripTz ? "your" : "trip"} timezone`}
              >
                <Globe className="w-3 h-3" />
                <span className="tabular-nums">{tzAbbr}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button — portaled to body to escape ancestor transforms that break position:fixed */}
      {mounted &&
        hasAnyAction &&
        !isLocked &&
        createPortal(
          <DropdownMenu open={fabOpen} onOpenChange={setFabOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="gradient"
                className={`fixed bottom-20 right-6 md:bottom-safe-8 md:right-8 lg:absolute lg:bottom-0 lg:right-0 z-50 rounded-full w-14 h-14 shadow-lg transition-all duration-300 ease-out ${
                  hideFab
                    ? "opacity-0 scale-75 pointer-events-none"
                    : "opacity-100 scale-100"
                }`}
                aria-label="Add to itinerary"
                tabIndex={hideFab ? -1 : undefined}
              >
                <Plus
                  className={`w-6 h-6 transition-transform duration-200 ${fabOpen ? "rotate-45" : ""}`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-48">
              {canAddEvent && (
                <DropdownMenuItem onSelect={() => setIsCreateEventOpen(true)}>
                  <Calendar className="w-4 h-4" />
                  Event
                </DropdownMenuItem>
              )}
              {isOrganizer && (
                <DropdownMenuItem
                  onSelect={() => setIsCreateAccommodationOpen(true)}
                >
                  <Building2 className="w-4 h-4" />
                  Accommodation
                </DropdownMenuItem>
              )}
              {isMember && (
                <DropdownMenuItem
                  onSelect={() => setIsCreateMemberTravelOpen(true)}
                >
                  <PlaneLanding className="w-4 h-4" />
                  My Travel
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>,
          document.body,
        )}

      {/* Dialogs */}
      <CreateEventDialog
        open={isCreateEventOpen}
        onOpenChange={setIsCreateEventOpen}
        tripId={tripId}
        timezone={selectedTimezone}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
      />
      <CreateAccommodationDialog
        open={isCreateAccommodationOpen}
        onOpenChange={setIsCreateAccommodationOpen}
        tripId={tripId}
        timezone={selectedTimezone}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
      />
      <CreateMemberTravelDialog
        open={isCreateMemberTravelOpen}
        onOpenChange={setIsCreateMemberTravelOpen}
        tripId={tripId}
        timezone={selectedTimezone}
        isOrganizer={isOrganizer}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        existingTravels={memberTravels}
      />
    </>
  );
}
