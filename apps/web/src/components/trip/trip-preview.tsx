"use client";

import Image from "next/image";
import { toast } from "sonner";
import {
  Calendar,
  MapPin,
  Users,
  ImagePlus,
  Loader2,
  Check,
  HelpCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateRange, getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import {
  useUpdateRsvp,
  getUpdateRsvpErrorMessage,
} from "@/hooks/use-invitations";
import type { TripDetailWithMeta } from "@/hooks/use-trips";
import type { UpdateRsvpInput } from "@journiful/shared/schemas";

interface TripPreviewProps {
  trip: TripDetailWithMeta;
  tripId: string;
  onGoingSuccess?: () => void;
}

export function TripPreview({
  trip,
  tripId,
  onGoingSuccess,
}: TripPreviewProps) {
  const { mutate: updateRsvp, isPending } = useUpdateRsvp(tripId);

  const dateRange = formatDateRange(trip.startDate, trip.endDate);

  const handleRsvp = (status: UpdateRsvpInput["status"]) => {
    updateRsvp(
      { status },
      {
        onSuccess: () => {
          const labels: Record<UpdateRsvpInput["status"], string> = {
            going: "Going",
            maybe: "Maybe",
            not_going: "Not Going",
          };
          toast.success(`RSVP updated to "${labels[status]}"`);
          if (status === "going") {
            onGoingSuccess?.();
          }
        },
        onError: (error) => {
          const message = getUpdateRsvpErrorMessage(error);
          toast.error(message ?? "Failed to update RSVP");
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background pb-safe">
      {/* Hero — shorter on mobile to keep CTA visible above the fold */}
      {trip.coverImageUrl ? (
        <div className="relative h-48 sm:h-72 overflow-hidden">
          <Image
            src={getUploadUrl(trip.coverImageUrl)!}
            alt={trip.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>
      ) : (
        <div className="relative w-full h-48 sm:h-72 overflow-hidden bg-gradient-to-br from-primary/20 via-accent/15 to-secondary/20">
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <ImagePlus className="w-10 h-10 text-white/40" />
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Trip info — compact & scannable */}
        <h1 className="text-2xl sm:text-4xl font-bold text-foreground font-playfair mb-3">
          {trip.name}
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:text-base text-muted-foreground mb-4">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 shrink-0" />
            {trip.destination}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-4 h-4 shrink-0" />
            {dateRange}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-4 h-4 shrink-0" />
            {trip.memberCount} member{trip.memberCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Organizers — inline */}
        {trip.organizers.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            <div className="flex -space-x-1.5">
              {trip.organizers.map((org) =>
                org.profilePhotoUrl ? (
                  <Image
                    key={org.id}
                    src={getUploadUrl(org.profilePhotoUrl)!}
                    alt={org.displayName}
                    width={28}
                    height={28}
                    className="w-7 h-7 rounded-full ring-2 ring-background object-cover"
                  />
                ) : (
                  <div
                    key={org.id}
                    className="w-7 h-7 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[10px] font-medium text-foreground"
                  >
                    {getInitials(org.displayName)}
                  </div>
                ),
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              Organized by{" "}
              {trip.organizers.map((org) => org.displayName).join(", ")}
            </span>
          </div>
        )}

        {/* Description */}
        {trip.description && (
          <p className="text-muted-foreground text-sm sm:text-base whitespace-pre-wrap mb-6">
            {trip.description}
          </p>
        )}

        {/* Invitation CTA card — the main action */}
        <div className="rounded-md border border-primary/20 bg-primary/[0.03] p-5 sm:p-6">
          <div className="text-center mb-5">
            <p className="text-lg sm:text-xl font-semibold text-foreground mb-1">
              You've been invited!
            </p>
            <p className="text-sm text-muted-foreground">
              RSVP to see the full itinerary.
            </p>
          </div>

          {/* RSVP buttons — full-width stacked on mobile, row on desktop */}
          <div
            className="flex flex-col sm:flex-row gap-3"
            data-testid="rsvp-buttons"
          >
            <Button
              onClick={() => handleRsvp("going")}
              disabled={isPending}
              size="lg"
              className={`flex-1 h-12 rounded-md text-base font-semibold ${
                trip.userRsvpStatus === "going"
                  ? "bg-success hover:bg-success/90 text-white shadow-md shadow-success/25"
                  : "bg-success/10 text-success hover:bg-success/20 border border-success/30"
              }`}
            >
              {isPending && trip.userRsvpStatus === "going" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Check className="w-5 h-5" />
              )}
              Going
            </Button>

            <Button
              onClick={() => handleRsvp("maybe")}
              disabled={isPending}
              size="lg"
              className={`flex-1 h-12 rounded-md text-base font-semibold ${
                trip.userRsvpStatus === "maybe"
                  ? "bg-warning hover:bg-warning/90 text-white shadow-md shadow-warning/25"
                  : "bg-warning/10 text-warning hover:bg-warning/20 border border-warning/30"
              }`}
            >
              {isPending && trip.userRsvpStatus === "maybe" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <HelpCircle className="w-5 h-5" />
              )}
              Maybe
            </Button>

            <Button
              onClick={() => handleRsvp("not_going")}
              disabled={isPending}
              size="lg"
              className={`flex-1 h-12 rounded-md text-base font-semibold ${
                trip.userRsvpStatus === "not_going"
                  ? "bg-destructive/15 text-destructive shadow-md shadow-destructive/10 border border-destructive/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border"
              }`}
            >
              {isPending && trip.userRsvpStatus === "not_going" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <X className="w-5 h-5" />
              )}
              Not Going
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
