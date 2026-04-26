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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  useCreateMemberTravel,
  getCreateMemberTravelErrorMessage,
} from "@/hooks/use-member-travel";
import { useAuth } from "@/app/providers/auth-provider";
import { useMembers } from "@/hooks/use-invitations";
import { getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { TIMEZONES, getTimezoneAbbr } from "@/lib/constants";
import { FlightLookupInput } from "@/components/itinerary/flight-lookup-input";
import type { FlightLookupResult } from "@journiful/shared/types";

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

  // Find the current user's member record
  const currentMember = members?.find((m) => m.userId === user?.id);

  // Smart default: if user already has an arrival, default to departure and vice versa
  const defaultTravelType = useMemo(() => {
    if (!existingTravels || !user?.id) return "arrival";
    const userTravels = existingTravels.filter((t) => t.userId === user.id);
    const hasArrival = userTravels.some((t) => t.travelType === "arrival");
    const hasDeparture = userTravels.some((t) => t.travelType === "departure");
    if (hasArrival && !hasDeparture) return "departure";
    return "arrival";
  }, [existingTravels, user?.id]);

  const form = useForm<CreateMemberTravelInput>({
    resolver: zodResolver(createMemberTravelSchema),
    defaultValues: {
      travelType: defaultTravelType,
      time: "",
      location: "",
      details: "",
      flightNumber: "",
    },
  });

  const travelType = form.watch("travelType");
  const travelTypeLabel = travelType === "departure" ? "Departure" : "Arrival";

  // Default date for flight lookup: trip end date for departures, start date for arrivals
  const flightLookupDefaultDate =
    travelType === "departure" ? (tripEndDate ?? undefined) : (tripStartDate ?? undefined);

  const handleFlightResult = (result: FlightLookupResult, flightNumber: string) => {
    const isArrival = travelType === "arrival";
    const airport = isArrival ? result.arrivalAirport : result.departureAirport;
    const time = isArrival ? result.arrivalTime : result.departureTime;
    const locationStr = airport.iata
      ? `${airport.name} (${airport.iata})`
      : airport.name;
    form.setValue("location", locationStr);
    // Convert to full UTC ISO string for Zod .datetime() validation and DateTimePicker
    const utcIso = new Date(time).toISOString();
    form.setValue("time", utcIso);
    form.setValue("flightNumber", flightNumber);
  };

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      form.reset({ travelType: defaultTravelType, time: "", location: "", details: "", flightNumber: "" });
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
    const data = { ...formData };
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
            Add your travel details
          </SheetTitle>
          <SheetDescription>
            Share your arrival or departure information with the group · All times in {getTimezoneAbbr(selectedTimezone)}
          </SheetDescription>
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
                      {members.map((member) => (
                        <SelectItem
                          key={member.id}
                          value={
                            member.userId === user?.id ? "self" : member.id
                          }
                        >
                          <span className="flex items-center gap-2">
                            <Avatar size="sm">
                              {member.profilePhotoUrl && (
                                <AvatarImage
                                  src={getUploadUrl(member.profilePhotoUrl)}
                                  alt={member.displayName}
                                />
                              )}
                              <AvatarFallback>
                                {getInitials(member.displayName)}
                              </AvatarFallback>
                            </Avatar>
                            {member.displayName}
                            {member.userId === user?.id ? " (You)" : ""}
                          </span>
                        </SelectItem>
                      ))}
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
                      <Avatar size="sm">
                        {currentMember.profilePhotoUrl && (
                          <AvatarImage
                            src={getUploadUrl(currentMember.profilePhotoUrl)}
                            alt={currentMember.displayName}
                          />
                        )}
                        <AvatarFallback>
                          {getInitials(currentMember.displayName)}
                        </AvatarFallback>
                      </Avatar>
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
                          onClick={() => field.onChange(type.value)}
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
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      {travelTypeLabel} time
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ""}
                        onChange={field.onChange}
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
                name="location"
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
