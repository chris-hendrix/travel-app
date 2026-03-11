"use client";

import {
  Pencil,
  Trash2,
  XIcon,
  MapPin,
  ExternalLink,
  Users,
  Loader2,
} from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { toast } from "sonner";
import type { Event } from "@tripful/shared/types";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useDeleteEvent, getDeleteEventErrorMessage } from "@/hooks/use-events";
import { cn } from "@/lib/utils";
import {
  formatInTimezone,
  getDayInTimezone,
  utcToLocalParts,
} from "@/lib/utils/timezone";
import { EVENT_TYPE_CONFIG } from "./event-card";

interface EventDetailSheetProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (event: Event) => void;
  createdByName?: string | undefined;
}

export function EventDetailSheet({
  event,
  open,
  onOpenChange,
  timezone,
  canEdit,
  canDelete,
  onEdit,
  createdByName,
}: EventDetailSheetProps) {
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();

  const handleDelete = () => {
    if (!event) return;
    deleteEvent(event.id, {
      onSuccess: () => {
        toast.success("Event deleted");
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(
          getDeleteEventErrorMessage(error) ?? "Failed to delete event",
        );
      },
    });
  };

  const config = event ? EVENT_TYPE_CONFIG[event.eventType] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} className={cn(config?.bg)}>
        <VisuallyHidden.Root>
          <SheetTitle>Event details</SheetTitle>
        </VisuallyHidden.Root>

        {/* Accent bar */}
        {config && (
          <div
            className={cn("h-1.5 w-full", config.color.replace("text-", "bg-"))}
          />
        )}

        {/* Header actions */}
        <div className="flex items-center justify-end gap-1 px-4 pt-4">
          {canEdit && event && (
            <button
              onClick={() => {
                onEdit(event);
                onOpenChange(false);
              }}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {canDelete && event && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  title="Delete"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete the event. Organizers can restore it later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    {isDeleting ? "Deleting..." : "Yes, delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <SheetClose className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
            <XIcon className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <SheetBody>
          {event && (
            <EventDetailBody
              event={event}
              timezone={timezone}
              createdByName={createdByName}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function EventDetailBody({
  event,
  timezone,
  createdByName,
}: {
  event: Event;
  timezone: string;
  createdByName?: string | undefined;
}) {
  const config = EVENT_TYPE_CONFIG[event.eventType];
  const TypeIcon = config.icon;

  // Midnight end times don't count as a separate day (e.g. 8 PM–12 AM is single-day)
  const endIsMidnight = event.endTime
    ? utcToLocalParts(
        typeof event.endTime === "string"
          ? event.endTime
          : event.endTime.toISOString(),
        timezone,
      ).time === "00:00"
    : false;

  const isMultiDay = event.endTime
    ? !endIsMidnight &&
      getDayInTimezone(event.startTime, timezone) !==
        getDayInTimezone(event.endTime, timezone)
    : false;

  let timeDisplay: string;
  if (event.allDay) {
    timeDisplay = "All day";
  } else if (isMultiDay) {
    const startPart = `${formatInTimezone(event.startTime, timezone, "short-date")}, ${formatInTimezone(event.startTime, timezone, "time")}`;
    const endPart = event.endTime
      ? `${formatInTimezone(event.endTime, timezone, "short-date")}, ${formatInTimezone(event.endTime, timezone, "time")}`
      : null;

    timeDisplay = endPart ? `${startPart} - ${endPart}` : startPart;
  } else {
    const st = formatInTimezone(event.startTime, timezone, "time");
    const et = event.endTime
      ? formatInTimezone(event.endTime, timezone, "time")
      : null;
    timeDisplay = et ? `${st} - ${et}` : st;
  }
  const startDate = formatInTimezone(event.startTime, timezone, "date");

  const typeLabel =
    event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1);

  return (
    <div className="space-y-4">
      {/* Event type chip */}
      <span className="inline-flex items-center gap-1 w-fit text-xs font-medium px-2 py-0.5 rounded-full bg-background/60 backdrop-blur-sm text-foreground">
        <TypeIcon className="w-3 h-3" />
        {typeLabel}
      </span>

      {/* Time display */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {isMultiDay ? timeDisplay : `${startDate} · ${timeDisplay}`}
        </span>
      </div>

      {/* Event name + warnings */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-lg">{event.name}</h3>
        {event.creatorAttending === false && (
          <Badge
            variant="outline"
            className="text-xs bg-warning/15 text-warning border-warning/30 shrink-0"
          >
            Member no longer attending
          </Badge>
        )}
        {event.isOptional && (
          <Badge
            variant="outline"
            className="text-xs bg-background/50 border-border shrink-0"
          >
            Optional
          </Badge>
        )}
      </div>

      {/* Location */}
      {event.location && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{event.location}</span>
        </a>
      )}

      {/* Description */}
      {event.description && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {event.description}
        </p>
      )}

      {/* Meetup info */}
      {(event.meetupLocation || event.meetupTime) && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            Meet{event.meetupLocation ? ` at ${event.meetupLocation}` : ""}
            {event.meetupTime
              ? ` at ${formatInTimezone(event.meetupTime, timezone, "time")}`
              : ""}
          </span>
        </div>
      )}

      {/* Links */}
      {event.links && event.links.length > 0 && (
        <div className="space-y-1.5">
          {event.links.map((link, index) => (
            <a
              key={index}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{link}</span>
            </a>
          ))}
        </div>
      )}

      {/* Creator info */}
      {createdByName && (
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/40">
          Added by {createdByName}
        </div>
      )}
    </div>
  );
}
