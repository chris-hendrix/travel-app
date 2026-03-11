"use client";

import { memo } from "react";
import {
  Building2,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  XIcon,
} from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { toast } from "sonner";
import type { Accommodation } from "@tripful/shared/types";
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
  useDeleteAccommodation,
  getDeleteAccommodationErrorMessage,
} from "@/hooks/use-accommodations";
import { formatInTimezone } from "@/lib/utils/timezone";

interface AccommodationDetailSheetProps {
  accommodation: Accommodation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (accommodation: Accommodation) => void;
  onDelete: (accommodation: Accommodation) => void;
  createdByName?: string | undefined;
}

export const AccommodationDetailSheet = memo(function AccommodationDetailSheet({
  accommodation,
  open,
  onOpenChange,
  timezone,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  createdByName,
}: AccommodationDetailSheetProps) {
  const { mutate: deleteAccommodation, isPending: isDeleting } =
    useDeleteAccommodation();

  const handleDelete = () => {
    if (!accommodation) return;
    deleteAccommodation(accommodation.id, {
      onSuccess: () => {
        toast.success("Accommodation deleted");
        onOpenChange(false);
        onDelete(accommodation);
      },
      onError: (error) => {
        toast.error(
          getDeleteAccommodationErrorMessage(error) ??
            "Failed to delete accommodation",
        );
      },
    });
  };

  if (!accommodation) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} className="bg-accommodation-light">
        <div className="h-1.5 w-full bg-accommodation" />
        <VisuallyHidden.Root>
          <SheetTitle>Accommodation details</SheetTitle>
        </VisuallyHidden.Root>

        {/* Header actions */}
        <div className="flex items-center justify-end gap-1 px-4 pt-4">
          {canEdit && (
            <button
              onClick={() => {
                onOpenChange(false);
                onEdit(accommodation);
              }}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete the accommodation. Organizers can restore
                    it later.
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
          </SheetClose>
        </div>

        <SheetBody className="space-y-4">
          {/* Type chip */}
          <span className="inline-flex items-center gap-1 w-fit text-xs font-medium px-2 py-0.5 rounded-full bg-background/60 backdrop-blur-sm text-foreground">
            <Building2 className="w-3 h-3" />
            Accommodation
          </span>

          {/* Accommodation name */}
          <h2 className="font-semibold text-lg">{accommodation.name}</h2>

          {/* Address */}
          {accommodation.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accommodation.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{accommodation.address}</span>
            </a>
          )}

          {/* Check-in / Check-out */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Check-in</span>
              <p className="font-medium text-sm">
                {formatInTimezone(accommodation.checkIn, timezone, "datetime")}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Check-out</span>
              <p className="font-medium text-sm">
                {formatInTimezone(accommodation.checkOut, timezone, "datetime")}
              </p>
            </div>
          </div>

          {/* Description */}
          {accommodation.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {accommodation.description}
            </p>
          )}

          {/* Links */}
          {accommodation.links && accommodation.links.length > 0 && (
            <div className="space-y-2">
              {accommodation.links.map((link, index) => (
                <a
                  key={index}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{link}</span>
                </a>
              ))}
            </div>
          )}

          {/* Created by */}
          {createdByName && (
            <p className="text-xs text-muted-foreground">
              Added by {createdByName}
            </p>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
});
