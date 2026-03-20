"use client";

import {
  Loader2,
  MapPin,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
  Trash2,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { VisuallyHidden } from "radix-ui";
import type { MemberTravel } from "@journiful/shared/types";
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
import {
  useDeleteMemberTravel,
  getDeleteMemberTravelErrorMessage,
} from "@/hooks/use-member-travel";
import { formatInTimezone } from "@/lib/utils/timezone";

interface MemberTravelDetailSheetProps {
  memberTravel: MemberTravel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  memberName: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (memberTravel: MemberTravel) => void;
  onDelete: (memberTravel: MemberTravel) => void;
}

export function MemberTravelDetailSheet({
  memberTravel,
  open,
  onOpenChange,
  timezone,
  memberName,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: MemberTravelDetailSheetProps) {
  const { mutate: deleteMemberTravel, isPending: isDeleting } =
    useDeleteMemberTravel();

  if (!memberTravel) {
    return null;
  }

  const travelTypeLabel =
    memberTravel.travelType === "arrival" ? "Arrival" : "Departure";
  const title = `${memberName}'s ${travelTypeLabel}`;
  const formattedDateTime = formatInTimezone(
    memberTravel.time,
    timezone,
    "datetime",
  );

  const handleEdit = () => {
    onOpenChange(false);
    onEdit(memberTravel);
  };

  const handleDelete = () => {
    deleteMemberTravel(memberTravel.id, {
      onSuccess: () => {
        toast.success("Travel details deleted");
        onOpenChange(false);
        onDelete(memberTravel);
      },
      onError: (error) => {
        toast.error(
          getDeleteMemberTravelErrorMessage(error) ??
            "Failed to delete travel details",
        );
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} className="bg-member-travel-light">
        <div className="h-1.5 w-full bg-member-travel" />
        <VisuallyHidden.Root>
          <SheetTitle>Travel details</SheetTitle>
        </VisuallyHidden.Root>

        {/* Header actions */}
        <div className="flex items-center justify-end gap-1 px-4 pt-4">
          {canEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              aria-label="Edit travel details"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Delete travel details"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete the travel details. You can add them again
                    later.
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
          <SheetClose asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </SheetClose>
        </div>

        <SheetBody>
          {/* Type chip */}
          <span className="inline-flex items-center gap-1 w-fit text-xs font-medium px-2 py-0.5 rounded-full bg-background/60 backdrop-blur-sm text-foreground mb-2">
            {memberTravel.travelType === "arrival" ? (
              <PlaneLanding className="w-3 h-3" />
            ) : (
              <PlaneTakeoff className="w-3 h-3" />
            )}
            {memberTravel.travelType === "arrival" ? "Arrival" : "Departure"}
          </span>

          {/* Title */}
          <h2 className="font-semibold text-lg">{title}</h2>

          {/* Date/time */}
          <p className="text-sm text-muted-foreground mt-1">
            {formattedDateTime}
          </p>

          {/* Location */}
          {memberTravel.location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(memberTravel.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{memberTravel.location}</span>
            </a>
          )}

          {/* Details */}
          {memberTravel.details && (
            <p className="mt-4 text-sm whitespace-pre-wrap">
              {memberTravel.details}
            </p>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
