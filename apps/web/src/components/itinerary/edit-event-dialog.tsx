"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, Car, Loader2, Plus, Trash2, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { parse, addHours } from "date-fns";
import {
  updateEventSchema,
  type UpdateEventInput,
} from "@journiful/shared/schemas";
import type { Event } from "@journiful/shared/types";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LocationInput } from "@/components/ui/location-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Checkbox } from "@/components/ui/checkbox";
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
  useUpdateEvent,
  getUpdateEventErrorMessage,
  useDeleteEvent,
  getDeleteEventErrorMessage,
} from "@/hooks/use-events";
import { mapServerErrors } from "@/lib/form-errors";
import { getTimezoneAbbr } from "@/lib/constants";

const EVENT_TYPES = [
  { value: "activity", label: "Activity", icon: Calendar },
  { value: "meal", label: "Meal", icon: Utensils },
  { value: "travel", label: "Travel", icon: Car },
] as const;

interface EditEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  timezone: string;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function EditEventDialog({
  open,
  onOpenChange,
  event,
  timezone,
  onSuccess,
  tripStartDate,
  tripEndDate,
}: EditEventDialogProps) {
  const { mutate: updateEvent, isPending } = useUpdateEvent();
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();
  const [newLink, setNewLink] = useState<{ url: string; name: string }>({
    url: "",
    name: "",
  });
  const [linkError, setLinkError] = useState<string | null>(null);
  const isInitializing = useRef(false);

  const form = useForm<UpdateEventInput>({
    resolver: zodResolver(updateEventSchema),
    defaultValues: {
      name: "",
      description: "",
      eventType: "activity",
      location: "",
      startTime: "",
      endTime: undefined,
      allDay: false,
      links: [],
    },
  });

  // Pre-populate form with existing event data when dialog opens
  useEffect(() => {
    if (open && event) {
      isInitializing.current = true;
      form.reset({
        name: event.name,
        description: event.description || "",
        eventType: event.eventType,
        location: event.location || "",
        locationLat: event.locationLat ?? null,
        locationLon: event.locationLon ?? null,
        startTime: event.startTime
          ? new Date(event.startTime).toISOString()
          : "",
        endTime: event.endTime
          ? new Date(event.endTime).toISOString()
          : undefined,
        allDay: event.allDay,
        links: event.links || [],
      });
      setNewLink({ url: "", name: "" });
      setLinkError(null);
      requestAnimationFrame(() => {
        isInitializing.current = false;
      });
    }
  }, [open, event, form, timezone]);

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
  const allDay = form.watch("allDay");
  const startTimeMonth = useMemo(() => {
    if (!startTimeValue) return undefined;
    const d = new Date(startTimeValue);
    return isNaN(d.getTime()) ? undefined : d;
  }, [startTimeValue]);

  // Auto-fill endTime when startTime is set and endTime is empty or before startTime (+1 hour)
  useEffect(() => {
    if (isInitializing.current) return;
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

  const handleSubmit = (data: UpdateEventInput) => {
    updateEvent(
      { eventId: event.id, data },
      {
        onSuccess: () => {
          toast.success("Event updated successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          const mapped = mapServerErrors(error, form.setError, {
            VALIDATION_ERROR: "name",
          });
          if (!mapped) {
            toast.error(
              getUpdateEventErrorMessage(error) ??
                "An unexpected error occurred.",
            );
          }
        },
      },
    );
  };

  const handleDelete = () => {
    deleteEvent(event.id, {
      onSuccess: () => {
        toast.success("Event deleted");
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(
          getDeleteEventErrorMessage(error) ?? "Failed to delete event",
        );
      },
    });
  };

  const handleAddLink = () => {
    setLinkError(null);

    if (!newLink.url.trim()) {
      setLinkError("URL is required");
      return;
    }

    // Auto-prepend https:// if no protocol is provided
    let normalizedUrl = newLink.url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setLinkError("Please enter a valid URL");
      return;
    }

    const currentLinks = form.getValues("links") || [];
    if (currentLinks.length >= 10) {
      setLinkError("Maximum 10 links allowed");
      return;
    }

    if (currentLinks.some((link) => link.url === normalizedUrl)) {
      setLinkError("This URL is already added");
      return;
    }

    const trimmedName = newLink.name.trim();
    form.setValue("links", [
      ...currentLinks,
      { url: normalizedUrl, ...(trimmedName ? { name: trimmedName } : {}) },
    ]);
    setNewLink({ url: "", name: "" });
  };

  const handleRemoveLink = (urlToRemove: string) => {
    const currentLinks = form.getValues("links") || [];
    form.setValue(
      "links",
      currentLinks.filter((link) => link.url !== urlToRemove),
    );
  };

  const links = form.watch("links") || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Edit event
          </SheetTitle>
          <SheetDescription>Update your event details · All times in {getTimezoneAbbr(timezone)}</SheetDescription>
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
                        disabled={isPending || isDeleting}
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
                    <div className="grid grid-cols-3 gap-3">
                      {EVENT_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          disabled={isPending || isDeleting}
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

              {/* All Day Checkbox */}
              <FormField
                control={form.control}
                name="allDay"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        name={field.name}
                        disabled={isPending || isDeleting}
                        aria-label="All day event"
                      />
                    </FormControl>
                    <FormLabel className="text-base font-semibold text-foreground cursor-pointer">
                      All day event
                    </FormLabel>
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
                        timezone={timezone}
                        placeholder="Select start time"
                        aria-label="Start time"
                        disabled={isPending || isDeleting || !!allDay}
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
                        timezone={timezone}
                        placeholder="Select end time"
                        aria-label="End time"
                        disabled={isPending || isDeleting || !!allDay}
                        defaultMonth={startTimeMonth || tripStartMonth}
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
                      Location
                    </FormLabel>
                    <FormControl>
                      <LocationInput
                        value={field.value ?? ""}
                        onChange={(val) => {
                          field.onChange(val);
                          form.setValue("locationLat", null);
                          form.setValue("locationLon", null);
                        }}
                        onSelect={(result) => {
                          field.onChange(result.displayName);
                          form.setValue("locationLat", result.lat);
                          form.setValue("locationLon", result.lon);
                        }}
                        placeholder="123 Main St, Miami Beach"
                        disabled={isPending || isDeleting}
                      />
                    </FormControl>
                    <FormMessage />
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
                          disabled={isPending || isDeleting}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      {showCounter && (
                        <div className="text-xs text-muted-foreground text-right">
                          {charCount} / 2000 characters
                        </div>
                      )}
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

                    {/* List of added links */}
                    {links.length > 0 && (
                      <div className="space-y-2 mt-2">
                        {links.map((link) => (
                          <div
                            key={link.url}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary border border-border"
                          >
                            <div className="min-w-0 flex-1">
                              {link.name && (
                                <p className="text-sm font-medium text-foreground truncate">
                                  {link.name}
                                </p>
                              )}
                              <p
                                className={
                                  link.name
                                    ? "text-xs text-muted-foreground truncate"
                                    : "text-sm font-medium text-foreground truncate"
                                }
                              >
                                {link.url}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLink(link.url)}
                              disabled={isPending || isDeleting}
                              className="min-w-[44px] min-h-[44px] rounded-full hover:bg-muted"
                              aria-label={`Remove ${link.name ?? link.url}`}
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add link input */}
                    <div className="space-y-2 mt-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          type="url"
                          placeholder="https://example.com"
                          value={newLink.url}
                          onChange={(e) => {
                            setNewLink((prev) => ({
                              ...prev,
                              url: e.target.value,
                            }));
                            setLinkError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddLink();
                            }
                          }}
                          disabled={isPending || isDeleting}
                          className="flex-1 h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                          aria-label="Link URL"
                          aria-describedby={
                            linkError ? "edit-event-link-error" : undefined
                          }
                        />
                        <Input
                          type="text"
                          placeholder="Display name (optional)"
                          value={newLink.name}
                          maxLength={100}
                          onChange={(e) => {
                            setNewLink((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }));
                            setLinkError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddLink();
                            }
                          }}
                          disabled={isPending || isDeleting}
                          className="flex-1 h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                          aria-label="Link display name"
                        />
                        <Button
                          type="button"
                          onClick={handleAddLink}
                          disabled={isPending || isDeleting}
                          className="h-12 px-4 bg-muted hover:bg-muted text-foreground rounded-md"
                          variant="outline"
                          aria-label="Add link"
                        >
                          <Plus className="w-5 h-5" />
                        </Button>
                      </div>
                      {linkError && (
                        <p
                          id="edit-event-link-error"
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
                  {isPending ? "Updating..." : "Update event"}
                </Button>
              </div>

              {/* Delete Button with AlertDialog */}
              <div className="pt-4 border-t border-border">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={isPending || isDeleting}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed py-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete event
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the event. Organizers can restore it
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
              </div>
            </form>
          </Form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
