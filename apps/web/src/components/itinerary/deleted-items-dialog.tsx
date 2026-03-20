"use client";

import { useMemo } from "react";
import { RotateCcw, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useEventsWithDeleted,
  useRestoreEvent,
  getRestoreEventErrorMessage,
} from "@/hooks/use-events";
import {
  useAccommodationsWithDeleted,
  useRestoreAccommodation,
  getRestoreAccommodationErrorMessage,
} from "@/hooks/use-accommodations";
import {
  useMemberTravelsWithDeleted,
  useRestoreMemberTravel,
  getRestoreMemberTravelErrorMessage,
} from "@/hooks/use-member-travel";
import { formatInTimezone } from "@/lib/utils/timezone";
import type { Event, Accommodation, MemberTravel } from "@journiful/shared/types";

interface DeletedItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  timezone: string;
}

export function DeletedItemsDialog({
  open,
  onOpenChange,
  tripId,
  timezone,
}: DeletedItemsDialogProps) {
  const { data: allEvents = [] } = useEventsWithDeleted(tripId);
  const { data: allAccommodations = [] } = useAccommodationsWithDeleted(tripId);
  const { data: allMemberTravels = [] } = useMemberTravelsWithDeleted(tripId);

  const restoreEvent = useRestoreEvent();
  const restoreAccommodation = useRestoreAccommodation();
  const restoreMemberTravel = useRestoreMemberTravel();

  const deletedEvents = useMemo(
    () => allEvents.filter((e) => e.deletedAt !== null),
    [allEvents],
  );
  const deletedAccommodations = useMemo(
    () => allAccommodations.filter((a) => a.deletedAt !== null),
    [allAccommodations],
  );
  const deletedMemberTravels = useMemo(
    () => allMemberTravels.filter((mt) => mt.deletedAt !== null),
    [allMemberTravels],
  );

  const totalDeleted =
    deletedEvents.length +
    deletedAccommodations.length +
    deletedMemberTravels.length;

  const handleRestoreEvent = (eventId: string) => {
    restoreEvent.mutate(eventId, {
      onSuccess: () => toast.success("Event restored"),
      onError: (error) =>
        toast.error(
          getRestoreEventErrorMessage(error) ?? "Failed to restore event",
        ),
    });
  };

  const handleRestoreAccommodation = (accommodationId: string) => {
    restoreAccommodation.mutate(accommodationId, {
      onSuccess: () => toast.success("Accommodation restored"),
      onError: (error) =>
        toast.error(
          getRestoreAccommodationErrorMessage(error) ??
            "Failed to restore accommodation",
        ),
    });
  };

  const handleRestoreMemberTravel = (memberTravelId: string) => {
    restoreMemberTravel.mutate(memberTravelId, {
      onSuccess: () => toast.success("Travel details restored"),
      onError: (error) =>
        toast.error(
          getRestoreMemberTravelErrorMessage(error) ??
            "Failed to restore travel details",
        ),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Deleted items
          </SheetTitle>
          <SheetDescription>
            {totalDeleted === 0
              ? "No deleted items."
              : "Restore items to bring them back to your itinerary."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {totalDeleted === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Trash2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              No deleted items
            </div>
          ) : (
            <div className="space-y-4">
              {deletedEvents.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Events
                  </h4>
                  <div className="space-y-2">
                    {deletedEvents.map((event) => (
                      <DeletedEventRow
                        key={event.id}
                        event={event}
                        timezone={timezone}
                        onRestore={handleRestoreEvent}
                        isRestoring={
                          restoreEvent.isPending &&
                          restoreEvent.variables === event.id
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {deletedAccommodations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Accommodations
                  </h4>
                  <div className="space-y-2">
                    {deletedAccommodations.map((accommodation) => (
                      <DeletedAccommodationRow
                        key={accommodation.id}
                        accommodation={accommodation}
                        timezone={timezone}
                        onRestore={handleRestoreAccommodation}
                        isRestoring={
                          restoreAccommodation.isPending &&
                          restoreAccommodation.variables === accommodation.id
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {deletedMemberTravels.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Member Travel
                  </h4>
                  <div className="space-y-2">
                    {deletedMemberTravels.map((memberTravel) => (
                      <DeletedMemberTravelRow
                        key={memberTravel.id}
                        memberTravel={memberTravel}
                        timezone={timezone}
                        onRestore={handleRestoreMemberTravel}
                        isRestoring={
                          restoreMemberTravel.isPending &&
                          restoreMemberTravel.variables === memberTravel.id
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter showCloseButton />
      </SheetContent>
    </Sheet>
  );
}

// --- Row sub-components ---

function DeletedEventRow({
  event,
  timezone,
  onRestore,
  isRestoring,
}: {
  event: Event;
  timezone: string;
  onRestore: (id: string) => void;
  isRestoring: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {event.name}
        </p>
        <p className="text-xs text-muted-foreground">
          Deleted{" "}
          {event.deletedAt
            ? formatInTimezone(event.deletedAt, timezone, "datetime")
            : ""}
        </p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs capitalize">
        {event.eventType}
      </Badge>
      <Button
        size="xs"
        variant="outline"
        className="shrink-0"
        onClick={() => onRestore(event.id)}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <RotateCcw className="h-3 w-3 mr-1" />
        )}
        Restore
      </Button>
    </div>
  );
}

function DeletedAccommodationRow({
  accommodation,
  timezone,
  onRestore,
  isRestoring,
}: {
  accommodation: Accommodation;
  timezone: string;
  onRestore: (id: string) => void;
  isRestoring: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {accommodation.name}
        </p>
        <p className="text-xs text-muted-foreground">
          Deleted{" "}
          {accommodation.deletedAt
            ? formatInTimezone(accommodation.deletedAt, timezone, "datetime")
            : ""}
        </p>
      </div>
      <Button
        size="xs"
        variant="outline"
        className="shrink-0"
        onClick={() => onRestore(accommodation.id)}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <RotateCcw className="h-3 w-3 mr-1" />
        )}
        Restore
      </Button>
    </div>
  );
}

function DeletedMemberTravelRow({
  memberTravel,
  timezone,
  onRestore,
  isRestoring,
}: {
  memberTravel: MemberTravel;
  timezone: string;
  onRestore: (id: string) => void;
  isRestoring: boolean;
}) {
  const label = memberTravel.memberName
    ? `${memberTravel.memberName} - ${memberTravel.travelType}`
    : memberTravel.travelType;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate capitalize">
          {label}
        </p>
        <p className="text-xs text-muted-foreground">
          Deleted{" "}
          {memberTravel.deletedAt
            ? formatInTimezone(memberTravel.deletedAt, timezone, "datetime")
            : ""}
        </p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs capitalize">
        {memberTravel.travelType}
      </Badge>
      <Button
        size="xs"
        variant="outline"
        className="shrink-0"
        onClick={() => onRestore(memberTravel.id)}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <RotateCcw className="h-3 w-3 mr-1" />
        )}
        Restore
      </Button>
    </div>
  );
}
