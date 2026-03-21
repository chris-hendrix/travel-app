"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Car, PlaneLanding, Plus, Building2, Plane, Settings, Utensils, type LucideIcon } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TIMEZONES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CreateEventDialog } from "./create-event-dialog";
import { CreateAccommodationDialog } from "./create-accommodation-dialog";
import { CreateMemberTravelDialog } from "./create-member-travel-dialog";

export type ItineraryFilter = "all" | "activity" | "meal" | "travel" | "members";

function getTimezoneLabel(tz: string): string {
  const match = TIMEZONES.find((t) => t.value === tz);
  if (match) return match.label;
  const parts = tz.split("/");
  const lastPart = parts[parts.length - 1];
  return lastPart ? lastPart.replace(/_/g, " ") : tz;
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

  const [fabOpen, setFabOpen] = useState(false);
  const mounted = useMounted();

  // Build timezone options: trip first, then user (if different), then all others
  const pinnedValues = new Set([tripTimezone, userTimezone]);
  const otherTimezones = TIMEZONES.filter((tz) => !pinnedValues.has(tz.value));

  // Permission checks
  const canAddEvent = isOrganizer || (isMember && allowMembersToAddEvents);
  const hasAnyAction = canAddEvent || isOrganizer || isMember;

  return (
    <>
      <div
        data-testid="itinerary-header"
        className="sticky top-0 z-30 bg-background border-b border-border py-2 px-4 sm:px-6 lg:px-8"
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
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0",
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

            {/* Timezone behind gear icon */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label="Timezone settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Timezone
                  </label>
                  <Select value={selectedTimezone} onValueChange={onTimezoneChange}>
                    <SelectTrigger size="sm" className="text-xs" aria-label="Timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={tripTimezone}>
                          {getTimezoneLabel(tripTimezone)} (Trip)
                        </SelectItem>
                        {tripTimezone !== userTimezone && (
                          <SelectItem value={userTimezone}>
                            {getTimezoneLabel(userTimezone)} (Current)
                          </SelectItem>
                        )}
                      </SelectGroup>
                      {otherTimezones.length > 0 && (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>All timezones</SelectLabel>
                            {otherTimezones.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Floating Action Button — portaled to body to escape ancestor transforms that break position:fixed */}
      {mounted &&
        hasAnyAction &&
        !isLocked &&
        !hideFab &&
        createPortal(
          <DropdownMenu open={fabOpen} onOpenChange={setFabOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="gradient"
                className="fixed bottom-safe-6 right-6 sm:bottom-safe-8 sm:right-8 z-50 rounded-full w-14 h-14 shadow-lg"
                aria-label="Add to itinerary"
              >
                <Plus
                  className={`w-6 h-6 transition-transform duration-200 ${fabOpen ? "rotate-45" : ""}`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-48">
              {canAddEvent && (
                <DropdownMenuItem onSelect={() => setIsCreateEventOpen(true)}>
                  <Plus className="w-4 h-4" />
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
                  <Plane className="w-4 h-4" />
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
      />
    </>
  );
}
