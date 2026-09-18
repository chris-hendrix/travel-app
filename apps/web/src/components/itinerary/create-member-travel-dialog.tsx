"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { toast } from "sonner";
import { parse } from "date-fns";
import {
  createMemberTravelSchema,
  type CreateMemberTravelInput,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberAvatar, isGuestMember } from "@/components/trip/guest-avatar";
import { GuestBadge } from "@/components/trip/guest-badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  useCreateMemberTravel,
  getCreateMemberTravelErrorMessage,
} from "@/hooks/use-member-travel";
import { useAuth } from "@/app/providers/auth-provider";
import { useMembers } from "@/hooks/use-invitations";
import { TIMEZONES, getTimezoneAbbr } from "@/lib/constants";
import { FlightLookupInput } from "@/components/itinerary/flight-lookup-input";
import type { FlightLookupResult } from "@journiful/shared/types";
import {
  applyFlightLookup,
  type FlightAutofillFields,
} from "@journiful/shared/utils";

const TRAVEL_TYPES = [
  { value: "arrival", label: "Arrival", icon: PlaneLanding },
  { value: "departure", label: "Departure", icon: PlaneTakeoff },
] as const;

interface CreateMemberTravelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  timezone: string;
  isOrganizer?: boolean;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
  /** Existing member travels for smart defaulting */
  existingTravels?: MemberTravel[] | undefined;
}

export function CreateMemberTravelDialog({
  open,
  onOpenChange,
  tripId,
  timezone,
  isOrganizer,
  onSuccess,
  tripStartDate,
  tripEndDate,
  existingTravels,
}: CreateMemberTravelDialogProps) {
  const { mutate: createMemberTravel, isPending } = useCreateMemberTravel();
  const { user } = useAuth();
  const { data: members } = useMembers(tripId);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  const [selectedMemberId, setSelectedMemberId] = useState("self");

  // Find the current user's member record (null-safe: guest rows have
  // userId null and never match a caller).
  const currentMember = members?.find(
    (m) => user?.id != null && m.userId != null && m.userId === user.id,
  );

  // Resolved member id drives smart defaults: "self" maps to the caller
  // member, otherwise the explicitly selected member (incl. guests).
  const resolvedMemberId =
    selectedMemberId === "self" ? currentMember?.id : selectedMemberId;

  const selectedMember = members?.find((m) =>
    selectedMemberId === "self"
      ? currentMember != null && m.id === currentMember.id
      : m.id === selectedMemberId,
  );
  const isGuestSelected =
    selectedMember != null && selectedMember.userId === null;
  const dialogTitle =
    selectedMemberId !== "self" && selectedMember
      ? `Add travel for ${selectedMember.displayName}`
      : "Add your travel details";

  // Smart default: if the selected member already has an arrival, default
  // to departure and vice versa (keyed by member.id, the canonical travel
  // identity).
  const defaultTravelType = useMemo(() => {
    if (!existingTravels || !resolvedMemberId) return "arrival";
    const memberTravels = existingTravels.filter(
      (t) => t.memberId === resolvedMemberId,
    );
    const hasArrival = memberTravels.some((t) => t.travelType === "arrival");
    const hasDeparture = memberTravels.some(
      (t) => t.travelType === "departure",
    );
    if (hasArrival && !hasDeparture) return "departure";
    return "arrival";
  }, [existingTravels, resolvedMemberId]);

  const form = useForm<CreateMemberTravelInput>({
    resolver: zodResolver(createMemberTravelSchema),
    defaultValues: {
      travelType: defaultTravelType,
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
  // Pertinent (visible) field names for the selected direction; the
  // counterpart pair is captured silently on flight lookup.
  const timeFieldName =
    travelType === "arrival" ? "arrivalTime" : "departureTime";
  const locationFieldName =
    travelType === "arrival" ? "arrivalLocation" : "departureLocation";

  // Hidden counterpart fields from flight lookup (persisted silently).
  const [hiddenAutofill, setHiddenAutofill] =
    useState<FlightAutofillFields | null>(null);

  // Default date for flight lookup: trip end date for departures, start date for arrivals
  const flightLookupDefaultDate =
    travelType === "departure" ? (tripEndDate ?? undefined) : (tripStartDate ?? undefined);

  const handleFlightResult = (result: FlightLookupResult, flightNumber: string) => {
    const filled = applyFlightLookup(travelType, result, flightNumber);
    const isArrival = travelType === "arrival";
    // Visible side
    form.setValue(isArrival ? "arrivalLocation" : "departureLocation", isArrival ? filled.arrivalLocation : filled.departureLocation);
    form.setValue(isArrival ? "arrivalTime" : "departureTime", (isArrival ? filled.arrivalTime : filled.departureTime) || undefined);
    form.setValue("flightNumber", flightNumber);
    // Counterpart side stored silently
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

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      form.reset({ travelType: defaultTravelType, arrivalTime: undefined, arrivalLocation: "", departureTime: undefined, departureLocation: "", details: "", flightNumber: "" });
      setHiddenAutofill(null);
      setSelectedTimezone(timezone);
      setSelectedMemberId("self");
    }
  }, [open, form, timezone, defaultTravelType]);

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

  const handleSubmit = (formData: CreateMemberTravelInput) => {
    // Strip blank form fields so optional datetimes validate as absent
    const cleaned = Object.fromEntries(
      Object.entries(formData).filter(([, v]) => v !== "" && v !== undefined),
    ) as CreateMemberTravelInput;
    const data = { ...cleaned };
    // Merge hidden counterpart fields captured on flight lookup
    if (hiddenAutofill) {
      const isArrival = formData.travelType === "arrival";
      if (isArrival) {
        if (hiddenAutofill.departureTime) data.departureTime = hiddenAutofill.departureTime;
        if (hiddenAutofill.departureLocation) data.departureLocation = hiddenAutofill.departureLocation;
      } else {
        if (hiddenAutofill.arrivalTime) data.arrivalTime = hiddenAutofill.arrivalTime;
        if (hiddenAutofill.arrivalLocation) data.arrivalLocation = hiddenAutofill.arrivalLocation;
      }
    }
    if (selectedMemberId && selectedMemberId !== "self") {
      data.memberId = selectedMemberId;
    }
    createMemberTravel(
      { tripId, data },
      {
        onSuccess: () => {
          toast.success("Travel details added successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(
            getCreateMemberTravelErrorMessage(error) ??
              "An unexpected error occurred.",
          );
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            {dialogTitle}
          </SheetTitle>
          <SheetDescription>
            Share {isGuestSelected ? "their" : "your"} arrival or departure information with the group · All times in {getTimezoneAbbr(selectedTimezone)}
          </SheetDescription>
          {isGuestSelected && selectedMember ? (
            <p className="text-sm text-muted-foreground">
              {selectedMember.displayName} has no app access, so you plan and track travel on their behalf.
            </p>
          ) : null}
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
              {/* Member Selector */}
              {isOrganizer && members && members.length > 0 ? (
                <FormItem>
                  <FormLabel className="text-base font-semibold text-foreground">
                    Member
                  </FormLabel>
                  <Select
                    value={selectedMemberId}
                    onValueChange={setSelectedMemberId}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger
                        className="h-12 text-base rounded-md"
                        data-testid="member-selector"
                      >
                        <SelectValue placeholder="Select a member" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {members.map((member) => {
                        const isSelf =
                          user?.id != null &&
                          member.userId != null &&
                          member.userId === user.id;
                        return (
                          <SelectItem
                            key={member.id}
                            value={isSelf ? "self" : member.id}
                          >
                          <span className="flex items-center gap-2">
                            <MemberAvatar member={member} size="sm" />
                            {member.displayName}
                            {user?.id != null &&
                            member.userId != null &&
                            member.userId === user.id
                              ? " (You)"
                              : ""}
                            {isGuestMember(member) ? <GuestBadge /> : null}
                          </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-sm text-muted-foreground">
                    As organizer, you can add travel for any member
                  </FormDescription>
                </FormItem>
              ) : (
                currentMember && (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Member
                    </FormLabel>
                    <div className="flex items-center gap-2 h-12 px-3 rounded-md border border-input bg-muted/50">
                      <MemberAvatar member={currentMember} size="sm" />
                      <span className="text-base text-muted-foreground">
                        {currentMember.displayName}
                      </span>
                    </div>
                  </FormItem>
                )
              )}

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
                          disabled={isPending}
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
                disabled={isPending}
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
                        disabled={isPending}
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
                        disabled={isPending}
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

              {/* More details */}
              <CollapsibleSection label="More details">
                <div className="space-y-6">
                  {/* Timezone */}
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Timezone
                    </FormLabel>
                    <Select
                      value={selectedTimezone}
                      onValueChange={setSelectedTimezone}
                      disabled={isPending}
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
                              disabled={isPending}
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
                  disabled={isPending}
                  className="flex-1 h-12 rounded-md border-input"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  variant="gradient"
                  className="flex-1 h-12 rounded-md"
                >
                  {isPending && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  {isPending ? "Adding..." : "Add travel details"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
