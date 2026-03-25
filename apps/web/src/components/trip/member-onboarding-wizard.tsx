"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  useCreateMemberTravel,
  useUpdateMemberTravel,
  useMemberTravels,
} from "@/hooks/use-member-travel";
import { useMembers, useUpdateMySettings } from "@/hooks/use-invitations";
import { useAuth } from "@/app/providers/auth-provider";
import { useCreateEvent } from "@/hooks/use-events";
import { localPartsToUTC, formatInTimezone } from "@/lib/utils/timezone";
import { toast } from "sonner";
import { parse } from "date-fns";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import { Loader2, X, Check, Plane, MapPin, Calendar } from "lucide-react";
import { FlightLookupInput } from "@/components/itinerary/flight-lookup-input";
import type { FlightLookupResult } from "@journiful/shared/types";

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
  const [arrivalLocation, setArrivalLocation] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalFlightNumber, setArrivalFlightNumber] = useState("");
  const [departureFlightNumber, setDepartureFlightNumber] = useState("");
  const [addedEvents, setAddedEvents] = useState<
    Array<{ name: string; startTime: string }>
  >([]);

  const { user } = useAuth();
  const { data: members = [] } = useMembers(tripId);
  const { data: memberTravels = [] } = useMemberTravels(tripId);
  const currentMember = members.find((m) => m.userId === user?.id);

  // Find existing arrival/departure for current member
  const existingArrival = memberTravels.find(
    (t) =>
      t.memberId === currentMember?.id &&
      t.travelType === "arrival" &&
      !t.deletedAt,
  );
  const existingDeparture = memberTravels.find(
    (t) =>
      t.memberId === currentMember?.id &&
      t.travelType === "departure" &&
      !t.deletedAt,
  );

  const canAddEvents = trip.isOrganizer || trip.allowMembersToAddEvents;
  const totalSteps = canAddEvents ? 5 : 4;
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || trip.preferredTimezone;

  const createTravel = useCreateMemberTravel();
  const updateTravel = useUpdateMemberTravel();
  const createEvent = useCreateEvent();
  const updateMySettings = useUpdateMySettings(tripId);

  // Arrival step form state
  const initialArrivalDate = trip.startDate
    ? localPartsToUTC(trip.startDate, "12:00", timezone)
    : "";
  const [arrivalDateValue, setArrivalDateValue] = useState(initialArrivalDate);
  const [arrivalLocationValue, setArrivalLocationValue] = useState("");

  // Departure step form state
  const initialDepartureDate = trip.endDate
    ? localPartsToUTC(trip.endDate, "12:00", timezone)
    : "";
  const [departureDateValue, setDepartureDateValue] =
    useState(initialDepartureDate);
  const [departureLocationValue, setDepartureLocationValue] = useState("");
  const [departureLocationInitialized, setDepartureLocationInitialized] =
    useState(false);

  // Events step form state
  const [eventName, setEventName] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");

  // Reset all wizard state when the sheet opens, pre-filling from existing data
  useEffect(() => {
    if (open) {
      setStep(0);
      setSharePhone(false);
      setAddedEvents([]);
      setEventName("");
      setEventStartTime("");
      setArrivalFlightNumber("");
      setDepartureFlightNumber("");

      if (existingArrival) {
        const arrivalISO = new Date(existingArrival.time).toISOString();
        setArrivalDateValue(arrivalISO);
        setArrivalLocationValue(existingArrival.location || "");
        setArrivalTime(arrivalISO);
        setArrivalLocation(existingArrival.location || "");
      } else {
        setArrivalDateValue(initialArrivalDate);
        setArrivalLocationValue("");
        setArrivalTime("");
        setArrivalLocation("");
      }

      if (existingDeparture) {
        const departureISO = new Date(existingDeparture.time).toISOString();
        setDepartureDateValue(departureISO);
        setDepartureLocationValue(existingDeparture.location || "");
        setDepartureTime(departureISO);
        setDepartureLocationInitialized(true);
      } else {
        setDepartureDateValue(initialDepartureDate);
        setDepartureLocationValue("");
        setDepartureTime("");
        setDepartureLocationInitialized(false);
      }
    }
  }, [open]);

  // Flight lookup dates from trip dates
  const arrivalLookupDate = trip.startDate || undefined;
  const departureLookupDate = trip.endDate || undefined;

  const handleArrivalFlightResult = (result: FlightLookupResult, flightNumber: string) => {
    const airport = result.arrivalAirport;
    const locationStr = airport.iata
      ? `${airport.name} (${airport.iata})`
      : airport.name;
    setArrivalLocationValue(locationStr);
    setArrivalDateValue(result.arrivalTime);
    setArrivalFlightNumber(flightNumber);
  };

  const handleDepartureFlightResult = (result: FlightLookupResult, flightNumber: string) => {
    const airport = result.departureAirport;
    const locationStr = airport.iata
      ? `${airport.name} (${airport.iata})`
      : airport.name;
    setDepartureLocationValue(locationStr);
    setDepartureDateValue(result.departureTime);
    setDepartureFlightNumber(flightNumber);
  };

  const doneStepIndex = totalSteps - 1;
  const eventsStepIndex = canAddEvents ? 3 : -1;

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
      // Arrival step
      if (!arrivalDateValue) {
        // Skip if no date entered
        setStep((s) => s + 1);
        return;
      }

      const onSuccess = () => {
        setArrivalTime(arrivalDateValue);
        setArrivalLocation(arrivalLocationValue);
        setStep((s) => s + 1);
      };
      const onError = () => {
        toast.error("Failed to save arrival details. Please try again.");
      };

      if (existingArrival) {
        updateTravel.mutate(
          {
            memberTravelId: existingArrival.id,
            data: {
              travelType: "arrival",
              time: arrivalDateValue,
              location: arrivalLocationValue || undefined,
              flightNumber: arrivalFlightNumber || undefined,
            },
          },
          { onSuccess, onError },
        );
      } else {
        createTravel.mutate(
          {
            tripId,
            data: {
              travelType: "arrival",
              time: arrivalDateValue,
              location: arrivalLocationValue || undefined,
              flightNumber: arrivalFlightNumber || undefined,
            },
          },
          { onSuccess, onError },
        );
      }
    } else if (step === 2) {
      // Departure step
      if (!departureDateValue) {
        setStep((s) => s + 1);
        return;
      }

      const onSuccess = () => {
        setDepartureTime(departureDateValue);
        setStep((s) => s + 1);
      };
      const onError = () => {
        toast.error("Failed to save departure details. Please try again.");
      };

      if (existingDeparture) {
        updateTravel.mutate(
          {
            memberTravelId: existingDeparture.id,
            data: {
              travelType: "departure",
              time: departureDateValue,
              location: departureLocationValue || undefined,
              flightNumber: departureFlightNumber || undefined,
            },
          },
          { onSuccess, onError },
        );
      } else {
        createTravel.mutate(
          {
            tripId,
            data: {
              travelType: "departure",
              time: departureDateValue,
              location: departureLocationValue || undefined,
              flightNumber: departureFlightNumber || undefined,
            },
          },
          { onSuccess, onError },
        );
      }
    } else if (step === eventsStepIndex) {
      // Events step - just advance
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleAddEvent() {
    if (!eventName || !eventStartTime) return;
    createEvent.mutate(
      {
        tripId,
        data: {
          name: eventName,
          eventType: "activity",
          startTime: eventStartTime,
          allDay: false,
          isOptional: false,
        },
      },
      {
        onSuccess: () => {
          setAddedEvents((prev) => [
            ...prev,
            { name: eventName, startTime: eventStartTime },
          ]);
          setEventName("");
          setEventStartTime("");
        },
        onError: () => {
          toast.error("Failed to add event. Please try again.");
        },
      },
    );
  }

  function handleRemoveEvent(index: number) {
    setAddedEvents((prev) => prev.filter((_, i) => i !== index));
  }

  // Pre-fill departure location from arrival when entering step 2
  useEffect(() => {
    if (step === 2 && !departureLocationInitialized && arrivalLocation) {
      setDepartureLocationValue(arrivalLocation);
      setDepartureLocationInitialized(true);
    }
  }, [step, arrivalLocation, departureLocationInitialized]);

  const isPending =
    createTravel.isPending ||
    updateTravel.isPending ||
    createEvent.isPending ||
    updateMySettings.isPending;

  // Trip-aware defaults
  const tripRange = useMemo(() => {
    if (!trip.startDate && !trip.endDate) return undefined;
    return { start: trip.startDate, end: trip.endDate };
  }, [trip.startDate, trip.endDate]);

  const tripStartMonth = useMemo(() => {
    if (!trip.startDate) return undefined;
    const parsed = parse(trip.startDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [trip.startDate]);

  const tripEndMonth = useMemo(() => {
    if (!trip.endDate) return undefined;
    const parsed = parse(trip.endDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [trip.endDate]);

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
                When are you arriving?
              </SheetTitle>
              <SheetDescription>
                Let the group know your travel plans
              </SheetDescription>
            </>
          )}

          {step === 2 && (
            <>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                When are you leaving?
              </SheetTitle>
              <SheetDescription>
                Help coordinate departure logistics
              </SheetDescription>
            </>
          )}

          {step === eventsStepIndex && (
            <>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                Want to suggest any activities?
              </SheetTitle>
              <SheetDescription>
                Add activities for the group to enjoy
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
            <div className="space-y-4">
              <FlightLookupInput
                date={arrivalLookupDate}
                onResult={handleArrivalFlightResult}
                disabled={isPending}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium">Date & Time</label>
                <DateTimePicker
                  value={arrivalDateValue}
                  onChange={setArrivalDateValue}
                  timezone={timezone}
                  placeholder="Pick arrival date & time"
                  aria-label="Arrival date and time"
                  defaultMonth={tripStartMonth}
                  tripRange={tripRange}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="arrival-location"
                  className="text-sm font-medium"
                >
                  Location
                </label>
                <Input
                  id="arrival-location"
                  value={arrivalLocationValue}
                  onChange={(e) => setArrivalLocationValue(e.target.value)}
                  placeholder="e.g., JFK Airport"
                  className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <FlightLookupInput
                date={departureLookupDate}
                onResult={handleDepartureFlightResult}
                disabled={isPending}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium">Date & Time</label>
                <DateTimePicker
                  value={departureDateValue}
                  onChange={setDepartureDateValue}
                  timezone={timezone}
                  placeholder="Pick departure date & time"
                  aria-label="Departure date and time"
                  defaultMonth={tripEndMonth}
                  tripRange={tripRange}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="departure-location"
                  className="text-sm font-medium"
                >
                  Location
                </label>
                <Input
                  id="departure-location"
                  value={departureLocationValue}
                  onChange={(e) => setDepartureLocationValue(e.target.value)}
                  placeholder="e.g., JFK Airport"
                  className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                />
              </div>
            </div>
          )}

          {step === eventsStepIndex && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="event-name" className="text-sm font-medium">
                  Activity name
                </label>
                <Input
                  id="event-name"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g., Beach day"
                  className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date & Time</label>
                <DateTimePicker
                  value={eventStartTime}
                  onChange={setEventStartTime}
                  timezone={timezone}
                  placeholder="Pick event date & time"
                  aria-label="Event date and time"
                  defaultMonth={tripStartMonth}
                  tripRange={tripRange}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-md w-full"
                onClick={handleAddEvent}
                disabled={
                  !eventName || !eventStartTime || createEvent.isPending
                }
              >
                {createEvent.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                Add
              </Button>

              {addedEvents.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Added activities
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {addedEvents.map((event, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5 text-sm"
                      >
                        <Calendar className="w-3 h-3" />
                        <span>{event.name}</span>
                        <span className="text-muted-foreground">
                          {formatInTimezone(
                            event.startTime,
                            timezone,
                            "datetime",
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEvent(index)}
                          className="ml-1 hover:text-destructive"
                          aria-label={`Remove ${event.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === doneStepIndex && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary" />
                </div>
              </div>

              <div className="space-y-3">
                {arrivalTime && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                    <Plane className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Arrival</p>
                      <p className="text-sm text-muted-foreground">
                        {formatInTimezone(arrivalTime, timezone, "datetime")}
                      </p>
                      {arrivalLocation && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {arrivalLocation}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {departureTime && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                    <Plane className="w-5 h-5 text-primary mt-0.5 rotate-90" />
                    <div>
                      <p className="text-sm font-medium">Departure</p>
                      <p className="text-sm text-muted-foreground">
                        {formatInTimezone(departureTime, timezone, "datetime")}
                      </p>
                    </div>
                  </div>
                )}

                {addedEvents.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                    <Calendar className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Activities</p>
                      <p className="text-sm text-muted-foreground">
                        {addedEvents.length}{" "}
                        {addedEvents.length === 1 ? "activity" : "activities"}{" "}
                        added
                      </p>
                    </div>
                  </div>
                )}

                {!arrivalTime && !departureTime && addedEvents.length === 0 && (
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
          <SheetFooter className="sm:justify-between">
            <div className="flex gap-2 w-full">
              {step > 0 && (
                <Button
                  variant="outline"
                  className="h-12 rounded-md"
                  onClick={handleBack}
                  disabled={isPending}
                >
                  Back
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-12 rounded-md"
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
