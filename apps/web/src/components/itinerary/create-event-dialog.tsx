"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { parse, addHours } from "date-fns";
import {
  createEventSchema,
  type CreateEventInput,
} from "@journiful/shared/schemas";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateEvent, getCreateEventErrorMessage } from "@/hooks/use-events";
import { mapServerErrors } from "@/lib/form-errors";
import { TIMEZONES } from "@/lib/constants";

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  timezone: string;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  tripId,
  timezone,
  onSuccess,
  tripStartDate,
  tripEndDate,
}: CreateEventDialogProps) {
  const { mutate: createEvent, isPending } = useCreateEvent();
  const [newLink, setNewLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: "",
      description: "",
      eventType: "activity",
      location: "",
      startTime: "",
      endTime: undefined,
      meetupLocation: "",
      meetupTime: undefined,
      allDay: false,
      isOptional: false,
      links: [],
      timezone: timezone,
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setNewLink("");
      setLinkError(null);
    }
  }, [open, form]);

  // Trip-aware defaults
  const tripStartMonth = useMemo(() => {
    if (!tripStartDate) return undefined;
    const parsed = parse(tripStartDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [tripStartDate]);

  const tripRange = useMemo(() => {
    if (!tripStartDate && !tripEndDate) return undefined;
    return { start: tripStartDate, end: tripEndDate };
  }, [tripStartDate, tripEndDate]);

  // Compute defaultMonth from watched startTime for end/meetup pickers
  const startTimeValue = form.watch("startTime");
  const startTimeMonth = useMemo(() => {
    if (!startTimeValue) return undefined;
    const d = new Date(startTimeValue);
    return isNaN(d.getTime()) ? undefined : d;
  }, [startTimeValue]);

  // Auto-fill endTime when startTime is set and endTime is empty or before startTime (+1 hour)
  useEffect(() => {
    if (startTimeValue) {
      const currentEnd = form.getValues("endTime");
      if (!currentEnd || new Date(currentEnd) <= new Date(startTimeValue)) {
        form.setValue(
          "endTime",
          addHours(new Date(startTimeValue), 1).toISOString(),
        );
      }
    }
  }, [startTimeValue, form]);

  const handleSubmit = (data: CreateEventInput) => {
    const { timezone: _tz, ...eventData } = data;
    createEvent(
      { tripId, data: eventData as CreateEventInput },
      {
        onSuccess: () => {
          toast.success("Event created successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          const mapped = mapServerErrors(error, form.setError, {
            VALIDATION_ERROR: "name",
          });
          if (!mapped) {
            toast.error(
              getCreateEventErrorMessage(error) ??
                "An unexpected error occurred.",
            );
          }
        },
      },
    );
  };

  const handleAddLink = () => {
    setLinkError(null);

    if (!newLink.trim()) {
      setLinkError("URL is required");
      return;
    }

    // Auto-prepend https:// if no protocol is provided
    let normalizedLink = newLink.trim();
    if (!/^https?:\/\//i.test(normalizedLink)) {
      normalizedLink = `https://${normalizedLink}`;
    }

    try {
      new URL(normalizedLink);
    } catch {
      setLinkError("Please enter a valid URL");
      return;
    }

    const currentLinks = form.getValues("links") || [];
    if (currentLinks.length >= 10) {
      setLinkError("Maximum 10 links allowed");
      return;
    }

    if (currentLinks.includes(normalizedLink)) {
      setLinkError("This URL is already added");
      return;
    }

    form.setValue("links", [...currentLinks, normalizedLink]);
    setNewLink("");
  };

  const handleRemoveLink = (linkToRemove: string) => {
    const currentLinks = form.getValues("links") || [];
    form.setValue(
      "links",
      currentLinks.filter((link) => link !== linkToRemove),
    );
  };

  const links = form.watch("links") || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Create a new event
          </SheetTitle>
          <SheetDescription>
            Add an event to your trip itinerary
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
              {/* Event Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Event name
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Dinner at Seaside Restaurant"
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        disabled={isPending}
                        aria-required="true"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Event Type */}
              <FormField
                control={form.control}
                name="eventType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Event type
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className="h-12 text-base rounded-md"
                          aria-required="true"
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="activity">Activity</SelectItem>
                        <SelectItem value="meal">Meal</SelectItem>
                        <SelectItem value="travel">Travel</SelectItem>
                      </SelectContent>
                    </Select>
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
                      Location
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="123 Main St, Miami Beach"
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Timezone */}
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Timezone
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className="h-12 text-base rounded-md"
                        >
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Start Time */}
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Start time
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ""}
                        onChange={field.onChange}
                        timezone={form.watch("timezone") || timezone}
                        placeholder="Select start time"
                        aria-label="Start time"
                        disabled={isPending}
                        defaultMonth={tripStartMonth}
                        tripRange={tripRange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* End Time */}
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      End time
                    </FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ""}
                        onChange={(val) => field.onChange(val || undefined)}
                        timezone={form.watch("timezone") || timezone}
                        placeholder="Select end time"
                        aria-label="End time"
                        disabled={isPending}
                        defaultMonth={startTimeMonth || tripStartMonth}
                        tripRange={tripRange}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-muted-foreground">
                      Optional: Leave empty if end time is unknown
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Meetup Location */}
              <FormField
                control={form.control}
                name="meetupLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Meetup location
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Hotel lobby, parking lot, etc."
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-muted-foreground">
                      Where to meet before the event
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Meetup Time */}
              <FormField
                control={form.control}
                name="meetupTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Meetup time
                    </FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ""}
                        onChange={(val) => field.onChange(val || undefined)}
                        timezone={form.watch("timezone") || timezone}
                        placeholder="Select meetup time"
                        aria-label="Meetup time"
                        disabled={isPending}
                        defaultMonth={startTimeMonth || tripStartMonth}
                        tripRange={tripRange}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-muted-foreground">
                      When to meet (can be before event start)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* All Day Checkbox */}
              <FormField
                control={form.control}
                name="allDay"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        name={field.name}
                        disabled={isPending}
                        aria-label="All day event"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-base font-semibold text-foreground cursor-pointer">
                        All day event
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground">
                        This event lasts all day
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* Optional Event Checkbox */}
              <FormField
                control={form.control}
                name="isOptional"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        name={field.name}
                        disabled={isPending}
                        aria-label="Optional event"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-base font-semibold text-foreground cursor-pointer">
                        Optional event
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground">
                        Members can choose whether to attend
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => {
                  const charCount = field.value?.length || 0;
                  const showCounter = charCount >= 1600;

                  return (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Description
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell your group about this event..."
                          className="h-32 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md resize-none"
                          disabled={isPending}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      {showCounter && (
                        <div className="text-xs text-muted-foreground text-right">
                          {charCount} / 2000 characters
                        </div>
                      )}
                      <FormDescription className="text-sm text-muted-foreground">
                        Optional: Share details about the event
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Links */}
              <FormField
                control={form.control}
                name="links"
                render={() => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Links
                    </FormLabel>
                    <FormDescription className="text-sm text-muted-foreground">
                      Add related links (tickets, reservations, etc.)
                    </FormDescription>

                    {/* List of added links */}
                    {links.length > 0 && (
                      <div className="space-y-2 mt-2">
                        {links.map((link) => (
                          <div
                            key={link}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary border border-border"
                          >
                            <span className="text-sm font-medium text-foreground truncate">
                              {link}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLink(link)}
                              disabled={isPending}
                              className="min-w-[44px] min-h-[44px] rounded-full hover:bg-muted"
                              aria-label={`Remove ${link}`}
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add link input */}
                    <div className="space-y-2 mt-2">
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          placeholder="https://example.com"
                          value={newLink}
                          onChange={(e) => {
                            setNewLink(e.target.value);
                            setLinkError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddLink();
                            }
                          }}
                          disabled={isPending}
                          className="flex-1 h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                          aria-label="Link URL"
                          aria-describedby={
                            linkError ? "event-link-error" : undefined
                          }
                        />
                        <Button
                          type="button"
                          onClick={handleAddLink}
                          disabled={isPending}
                          className="h-12 px-4 bg-muted hover:bg-muted text-foreground rounded-md"
                          variant="outline"
                          aria-label="Add link"
                        >
                          <Plus className="w-5 h-5" />
                        </Button>
                      </div>
                      {linkError && (
                        <p
                          id="event-link-error"
                          aria-live="polite"
                          className="text-sm text-destructive"
                        >
                          {linkError}
                        </p>
                      )}
                    </div>

                    <FormMessage />
                  </FormItem>
                )}
              />

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
                  {isPending ? "Creating..." : "Create event"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
