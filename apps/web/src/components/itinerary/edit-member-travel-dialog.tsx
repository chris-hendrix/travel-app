"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlaneLanding, PlaneTakeoff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parse } from "date-fns";
import {
  updateMemberTravelSchema,
  type UpdateMemberTravelInput,
} from "@journiful/shared/schemas";
import type { MemberTravel } from "@journiful/shared/types";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datetime-picker";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  useUpdateMemberTravel,
  getUpdateMemberTravelErrorMessage,
  useDeleteMemberTravel,
  getDeleteMemberTravelErrorMessage,
} from "@/hooks/use-member-travel";
import { TIMEZONES, getTimezoneAbbr } from "@/lib/constants";
import { FlightLookupInput } from "@/components/itinerary/flight-lookup-input";
import type { FlightLookupResult } from "@journiful/shared/types";
import {
  applyFlightLookup,
  getPertinentTime,
  getCounterpartTime,
  getCounterpartLocation,
  type FlightAutofillFields,
} from "@journiful/shared/utils";
import { formatInTimezone } from "@/lib/utils/timezone";

const TRAVEL_TYPES = [
  { value: "arrival", label: "Arrival", icon: PlaneLanding },
  { value: "departure", label: "Departure", icon: PlaneTakeoff },
] as const;

interface EditMemberTravelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberTravel: MemberTravel;
  timezone: string;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function EditMemberTravelDialog({
  open,
  onOpenChange,
  memberTravel,
  timezone,
  onSuccess,
  tripStartDate,
  tripEndDate,
}: EditMemberTravelDialogProps) {
  const { mutate: updateMemberTravel, isPending } = useUpdateMemberTravel();
  const { mutate: deleteMemberTravel, isPending: isDeleting } =
    useDeleteMemberTravel();
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);

  const form = useForm<UpdateMemberTravelInput>({
    resolver: zodResolver(updateMemberTravelSchema),
    defaultValues: {
      travelType: "arrival",
      arrivalTime: undefined,
      arrivalLocation: "",
      departureTime: undefined,
      departureLocation: "",
      details: "",
      flightNumber: "",
    },
  });

  const travelType = form.watch("travelType");
  const travelTypeLabel = travelType === "departure" ? "Departure" : "Arrival";
  const timeFieldName =
    travelType === "arrival" ? "arrivalTime" : "departureTime";
  const locationFieldName =
    travelType === "arrival" ? "arrivalLocation" : "departureLocation";

  // Hidden counterpart fields from flight lookup (persisted silently).
  const [hiddenAutofill, setHiddenAutofill] =
    useState<FlightAutofillFields | null>(null);

  // Default date for flight lookup: from existing travel record (pertinent time)
  const pertinentTimeForLookup = getPertinentTime(memberTravel);
  const flightLookupDefaultDate = pertinentTimeForLookup
    ? new Date(pertinentTimeForLookup).toISOString().slice(0, 10)
    : undefined;

  // Stored counterpart (lookup-set origin/destination) shown read-only
  const storedCounterpartTime = getCounterpartTime(memberTravel);
  const storedCounterpartLocation = getCounterpartLocation(memberTravel);

  const handleFlightResult = (result: FlightLookupResult, flightNumber: string) => {
    const filled = applyFlightLookup(travelType ?? "arrival", result, flightNumber);
    const isArrival = travelType === "arrival";
    form.setValue(isArrival ? "arrivalLocation" : "departureLocation", isArrival ? filled.arrivalLocation : filled.departureLocation);
    form.setValue(isArrival ? "arrivalTime" : "departureTime", (isArrival ? filled.arrivalTime : filled.departureTime) || undefined);
    form.setValue("flightNumber", flightNumber);
    setHiddenAutofill({
      flightNumber,
      ...(isArrival
        ? {
            departureTime: filled.departureTime,
            departureLocation: filled.departureLocation,
          }
        : {
            arrivalTime: filled.arrivalTime,
            arrivalLocation: filled.arrivalLocation,
          }),
    });
  };

  // Pre-populate form with existing member travel data when dialog opens
  useEffect(() => {
    if (open && memberTravel) {
      form.reset({
        travelType: memberTravel.travelType,
        arrivalTime: memberTravel.arrivalTime
          ? new Date(memberTravel.arrivalTime).toISOString()
          : undefined,
        arrivalLocation: memberTravel.arrivalLocation || "",
        departureTime: memberTravel.departureTime
          ? new Date(memberTravel.departureTime).toISOString()
          : undefined,
        departureLocation: memberTravel.departureLocation || "",
        details: memberTravel.details || "",
        flightNumber: memberTravel.flightNumber || "",
      });
      setHiddenAutofill(null);
      setSelectedTimezone(timezone);
    }
  }, [open, memberTravel, form, timezone]);

  // Trip-aware defaults
  const tripStartMonth = useMemo(() => {
    if (!tripStartDate) return undefined;
    const parsed = parse(tripStartDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [tripStartDate]);

  const tripEndMonth = useMemo(() => {
    if (!tripEndDate) return undefined;
    const parsed = parse(tripEndDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [tripEndDate]);

  const tripRange = useMemo(() => {
    if (!tripStartDate && !tripEndDate) return undefined;
    return { start: tripStartDate, end: tripEndDate };
  }, [tripStartDate, tripEndDate]);

  const handleSubmit = (data: UpdateMemberTravelInput) => {
    // Strip blank form fields so optional datetimes validate as absent
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== "" && v !== undefined),
    ) as UpdateMemberTravelInput;
    // Merge hidden counterpart fields captured on flight lookup
    if (hiddenAutofill) {
      const isArrival = (data.travelType ?? memberTravel.travelType) === "arrival";
      if (isArrival) {
        if (hiddenAutofill.departureTime) payload.departureTime = hiddenAutofill.departureTime;
        if (hiddenAutofill.departureLocation) payload.departureLocation = hiddenAutofill.departureLocation;
      } else {
        if (hiddenAutofill.arrivalTime) payload.arrivalTime = hiddenAutofill.arrivalTime;
        if (hiddenAutofill.arrivalLocation) payload.arrivalLocation = hiddenAutofill.arrivalLocation;
      }
    }
    updateMemberTravel(
      { memberTravelId: memberTravel.id, data: payload },
      {
        onSuccess: () => {
          toast.success("Travel details updated successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(
            getUpdateMemberTravelErrorMessage(error) ??
              "An unexpected error occurred.",
          );
        },
      },
    );
  };

  const handleDelete = () => {
    deleteMemberTravel(memberTravel.id, {
      onSuccess: () => {
        toast.success("Travel details deleted");
        onOpenChange(false);
        onSuccess?.();
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Edit travel details
          </SheetTitle>
          <SheetDescription>Update your travel information · All times in {getTimezoneAbbr(selectedTimezone)}</SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
              {/* Travel Type */}
              <FormField
                control={form.control}
                name="travelType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Travel type
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <div className="grid grid-cols-2 gap-3">
                      {TRAVEL_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          disabled={isPending || isDeleting}
                          onClick={() => {
                            field.onChange(type.value);
                            setHiddenAutofill(null);
                          }}
                          className={`p-3 rounded-lg border-2 flex flex-col items-center cursor-pointer transition-colors ${
                            field.value === type.value
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-muted-foreground"
                          }`}
                        >
                          <type.icon className="w-5 h-5" />
                          <div className="text-sm font-medium mt-1">
                            {type.label}
                          </div>
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Flight Number + Lookup */}
              <FlightLookupInput
                defaultDate={flightLookupDefaultDate}
                onResult={handleFlightResult}
                onFlightNumberChange={(fn) => form.setValue("flightNumber", fn)}
                defaultValue={memberTravel.flightNumber || undefined}
                disabled={isPending || isDeleting}
                defaultMonth={travelType === "departure" ? tripEndMonth : tripStartMonth}
                tripRange={tripRange}
              />

              {/* Time */}
              <FormField
                control={form.control}
                name={timeFieldName}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      {travelTypeLabel} time
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ""}
                        onChange={(v) => field.onChange(v || undefined)}
                        timezone={selectedTimezone}
                        placeholder="Select date & time"
                        aria-label="Travel time"
                        disabled={isPending || isDeleting}
                        defaultMonth={
                          travelType === "departure"
                            ? tripEndMonth
                            : tripStartMonth
                        }
                        tripRange={tripRange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location */}
              <FormField
                control={form.control}
                name={locationFieldName}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      {travelTypeLabel} location
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Miami International Airport (MIA)"
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        disabled={isPending || isDeleting}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-muted-foreground">
                      Optional: Airport, station, or meeting point
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Stored counterpart (lookup-set origin/destination) */}
              {storedCounterpartLocation && storedCounterpartTime && (
                <p className="text-sm text-muted-foreground">
                  {memberTravel.travelType === "arrival"
                    ? `Departed from ${storedCounterpartLocation} at ${formatInTimezone(storedCounterpartTime, selectedTimezone, "time")}`
                    : `Arriving at ${storedCounterpartLocation} at ${formatInTimezone(storedCounterpartTime, selectedTimezone, "time")}`}
                </p>
              )}

              {/* More details */}
              <CollapsibleSection label="More details" defaultOpen={!!memberTravel.details}>
                <div className="space-y-6">
                  {/* Timezone */}
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Timezone
                    </FormLabel>
                    <Select
                      value={selectedTimezone}
                      onValueChange={setSelectedTimezone}
                      disabled={isPending || isDeleting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-12 text-base rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>

                  {/* Details */}
                  <FormField
                    control={form.control}
                    name="details"
                    render={({ field }) => {
                      const charCount = field.value?.length || 0;
                      const showCounter = charCount >= 400;

                      return (
                        <FormItem>
                          <FormLabel className="text-base font-semibold text-foreground">
                            Details
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Terminal info, ride arrangements, or other notes..."
                              className="h-32 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md resize-none"
                              disabled={isPending || isDeleting}
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          {showCounter && (
                            <div className="text-xs text-muted-foreground text-right">
                              {charCount} / 500 characters
                            </div>
                          )}
                          <FormDescription className="text-sm text-muted-foreground">
                            Optional: Share additional travel details
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </CollapsibleSection>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending || isDeleting}
                  className="flex-1 h-12 rounded-md border-input"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || isDeleting}
                  variant="gradient"
                  className="flex-1 h-12 rounded-md"
                >
                  {isPending && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  {isPending ? "Updating..." : "Update travel details"}
                </Button>
              </div>

              {/* Delete — low-prominence link at the bottom */}
              <div className="flex justify-center pt-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={isPending || isDeleting}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed py-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete travel details
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete your travel details. You can add them
                        again later.
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
              </div>
            </form>
          </Form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
