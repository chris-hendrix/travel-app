"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, List, Plus, Building2, Plane } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
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
import { CreateEventDialog } from "./create-event-dialog";
import { CreateAccommodationDialog } from "./create-accommodation-dialog";
import { CreateMemberTravelDialog } from "./create-member-travel-dialog";

function getTimezoneLabel(tz: string): string {
  const match = TIMEZONES.find((t) => t.value === tz);
  if (match) return match.label;
  const parts = tz.split("/");
  const lastPart = parts[parts.length - 1];
  return lastPart ? lastPart.replace(/_/g, " ") : tz;
}

interface ItineraryHeaderProps {
  viewMode: "day-by-day" | "group-by-type";
  onViewModeChange: (mode: "day-by-day" | "group-by-type") => void;
  selectedTimezone: string;
  onTimezoneChange: (tz: string) => void;
  tripTimezone: string;
  userTimezone: string;
  tripId: string;
  isOrganizer: boolean;
  isMember: boolean;
  allowMembersToAddEvents: boolean;
  isLocked?: boolean;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function ItineraryHeader({
  viewMode,
  onViewModeChange,
  selectedTimezone,
  onTimezoneChange,
  tripTimezone,
  userTimezone,
  tripId,
  isOrganizer,
  isMember,
  allowMembersToAddEvents,
  isLocked,
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Left: View mode toggle + timezone */}
            <TooltipProvider>
              <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-md border border-border">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant={viewMode === "day-by-day" ? "default" : "ghost"}
                      onClick={() => onViewModeChange("day-by-day")}
                      className="relative after:absolute after:content-[''] after:-inset-[4px] rounded-lg"
                      aria-label="Day by Day"
                    >
                      <Calendar className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Day by Day</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant={
                        viewMode === "group-by-type" ? "default" : "ghost"
                      }
                      onClick={() => onViewModeChange("group-by-type")}
                      className="relative after:absolute after:content-[''] after:-inset-[4px] rounded-lg"
                      aria-label="Group by Type"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Group by Type</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            <div className="min-w-0">
              <Select value={selectedTimezone} onValueChange={onTimezoneChange}>
                <SelectTrigger
                  size="sm"
                  className="text-xs"
                  aria-label="Timezone"
                >
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
