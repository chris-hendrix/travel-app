"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMemberTravels } from "@/hooks/use-member-travel";
import { useMembers, useUpdateMySettings } from "@/hooks/use-invitations";
import { useAuth } from "@/app/providers/auth-provider";
import { formatInTimezone } from "@/lib/utils/timezone";
import { mapsSearchUrl } from "@journiful/shared/utils";
import { toast } from "sonner";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import { Loader2, Check, Plane, MapPin } from "lucide-react";
import {
  TravelFormSections,
  type TravelFormSectionsHandle,
  type TravelSaveSummary,
} from "@/components/trip/travel-form-sections";

interface MemberOnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  trip: TripDetailWithMeta;
}

export function MemberOnboardingWizard({
  open,
  onOpenChange,
  tripId,
  trip,
}: MemberOnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [sharePhone, setSharePhone] = useState(false);
  const [summary, setSummary] = useState<TravelSaveSummary | null>(null);
  const [isSavingTravel, setIsSavingTravel] = useState(false);
  const travelFormRef = useRef<TravelFormSectionsHandle>(null);

  const { user } = useAuth();
  const { data: members = [] } = useMembers(tripId);
  const { data: memberTravels = [] } = useMemberTravels(tripId);
  // Null-safe: guest rows have userId null and never match the viewer.
  const currentMember = user?.id
    ? members.find((m) => m.userId === user.id)
    : undefined;

  // Find existing arrival/departure for current member
  const existingArrival =
    memberTravels.find(
      (t) =>
        t.memberId === currentMember?.id &&
        t.travelType === "arrival" &&
        !t.deletedAt,
    ) ?? null;
  const existingDeparture =
    memberTravels.find(
      (t) =>
        t.memberId === currentMember?.id &&
        t.travelType === "departure" &&
        !t.deletedAt,
    ) ?? null;

  const totalSteps = 3;
  const doneStepIndex = totalSteps - 1;
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || trip.preferredTimezone;

  const updateMySettings = useUpdateMySettings(tripId);

  // Reset wizard state when the sheet opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setSharePhone(false);
      setSummary(null);
      setIsSavingTravel(false);
    }
  }, [open ]);

  function handleNext() {
    if (step === 0) {
      // Phone sharing step
      updateMySettings.mutate(
        { sharePhone },
        {
          onSuccess: () => setStep((s) => s + 1),
          onError: () => {
            toast.error("Failed to save privacy setting. Please try again.");
          },
        },
      );
    } else if (step === 1) {
      // Combined travel step — save via the form sections
      const form = travelFormRef.current;
      if (!form) {
        setStep((s) => s + 1);
        return;
      }
      setIsSavingTravel(true);
      form
        .save()
        .then((result) => {
          setSummary(result);
          setStep((s) => s + 1);
        })
        .catch(() => {
          toast.error("Failed to save travel details. Please try again.");
        })
        .finally(() => {
          setIsSavingTravel(false);
        });
    }
  }

  function handleSkip() {
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  const isPending = updateMySettings.isPending || isSavingTravel;

  const hasTravel =
    !!summary?.arrivalTime ||
    !!summary?.departureTime ||
    !!existingArrival?.arrivalTime ||
    !!existingDeparture?.departureTime;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-2 mb-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
            <span className="text-sm text-muted-foreground ml-2">
              Step {step + 1} of {totalSteps}
            </span>
          </div>

          {step === 0 && (
            <>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                Share your phone number?
              </SheetTitle>
              <SheetDescription>
                Let other trip members contact you directly
              </SheetDescription>
            </>
          )}

          {step === 1 && (
            <>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                When are you traveling?
              </SheetTitle>
              <SheetDescription>
                Let the group know your travel plans
              </SheetDescription>
            </>
          )}

          {step === doneStepIndex && (
            <>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                {"You're all set!"}
              </SheetTitle>
              <SheetDescription>
                {"Here's a summary of what you added"}
              </SheetDescription>
            </>
          )}
        </SheetHeader>

        <SheetBody>
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="share-phone-wizard"
                    className="text-sm font-medium"
                  >
                    Share phone number
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Other members will be able to see your phone number for this
                    trip. Organizers can always see it.
                  </p>
                </div>
                <Switch
                  id="share-phone-wizard"
                  checked={sharePhone}
                  onCheckedChange={setSharePhone}
                  aria-label="Share phone number"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <TravelFormSections
              key={String(open)}
              ref={travelFormRef}
              tripId={tripId}
              trip={trip}
              timezone={timezone}
              existingArrival={existingArrival}
              existingDeparture={existingDeparture}
            />
          )}

          {step === doneStepIndex && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary" />
                </div>
              </div>

              <div className="space-y-3">
                {(summary?.arrivalTime ?? existingArrival?.arrivalTime) && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                    <Plane className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Arrival</p>
                      <p className="text-sm text-muted-foreground">
                        {formatInTimezone(
                          summary?.arrivalTime ??
                            existingArrival!.arrivalTime!,
                          timezone,
                          "datetime",
                        )}
                      </p>
                      {(summary?.arrivalLocation ??
                        existingArrival?.arrivalLocation) && (
                        <a
                          href={mapsSearchUrl(
                            summary?.arrivalLocation ??
                              existingArrival!.arrivalLocation!,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" />
                          {summary?.arrivalLocation ??
                            existingArrival!.arrivalLocation}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {(summary?.departureTime ?? existingDeparture?.departureTime) && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                    <Plane className="w-5 h-5 text-primary mt-0.5 rotate-90" />
                    <div>
                      <p className="text-sm font-medium">Departure</p>
                      <p className="text-sm text-muted-foreground">
                        {formatInTimezone(
                          summary?.departureTime ??
                            existingDeparture!.departureTime!,
                          timezone,
                          "datetime",
                        )}
                      </p>
                      {(summary?.departureLocation ??
                        existingDeparture?.departureLocation) && (
                        <a
                          href={mapsSearchUrl(
                            summary?.departureLocation ??
                              existingDeparture!.departureLocation!,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" />
                          {summary?.departureLocation ??
                            existingDeparture!.departureLocation}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!hasTravel && (
                  <p className="text-sm text-muted-foreground text-center">
                    No travel details added yet. You can always add them later
                    from the trip page.
                  </p>
                )}
              </div>
            </div>
          )}
        </SheetBody>

        {step === doneStepIndex ? (
          <SheetFooter>
            <Button
              variant="gradient"
              className="h-12 rounded-md w-full"
              onClick={() => onOpenChange(false)}
            >
              View Itinerary
            </Button>
          </SheetFooter>
        ) : (
          <SheetFooter>
            <div className="flex gap-4 w-full">
              {step > 0 && (
                <Button
                  variant="outline"
                  className="h-12 rounded-md flex-1"
                  onClick={handleBack}
                  disabled={isPending}
                >
                  Back
                </Button>
              )}
              <Button
                variant="outline"
                className="h-12 rounded-md flex-1"
                onClick={handleSkip}
                disabled={isPending}
              >
                Skip
              </Button>
              <Button
                variant="gradient"
                className="h-12 rounded-md flex-1"
                onClick={handleNext}
                disabled={isPending}
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Next
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
