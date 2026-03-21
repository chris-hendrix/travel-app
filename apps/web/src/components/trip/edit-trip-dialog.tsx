"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateTripSchema, type UpdateTripInput } from "@journiful/shared";
import { toast } from "sonner";
import {
  useUpdateTrip,
  getUpdateTripErrorMessage,
  useCancelTrip,
  getCancelTripErrorMessage,
  type Trip,
} from "@/hooks/use-trips";
import { mapServerErrors } from "@/lib/form-errors";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Trash2, Loader2 } from "lucide-react";
import { TIMEZONES } from "@/lib/constants";

interface EditTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  onSuccess?: () => void;
}

export function EditTripDialog({
  open,
  onOpenChange,
  trip,
  onSuccess,
}: EditTripDialogProps) {
  const { mutate: updateTrip, isPending } = useUpdateTrip();
  const { mutate: cancelTrip, isPending: isDeleting } = useCancelTrip();

  const form = useForm<UpdateTripInput>({
    resolver: zodResolver(updateTripSchema),
    defaultValues: {
      name: "",
      destination: "",
      startDate: undefined,
      endDate: undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      description: "",
      allowMembersToAddEvents: true,
      showAllMembers: false,
    },
  });

  const isInitializing = useRef(false);

  // Pre-populate form with existing trip data when dialog opens
  useEffect(() => {
    if (open && trip) {
      isInitializing.current = true;
      form.reset({
        name: trip.name,
        destination: trip.destination,
        startDate: trip.startDate || undefined,
        endDate: trip.endDate || undefined,
        timezone: trip.preferredTimezone,
        description: trip.description || "",
        allowMembersToAddEvents: trip.allowMembersToAddEvents,
        showAllMembers: trip.showAllMembers,
      });
      // Allow the reset to settle before enabling auto-fill
      requestAnimationFrame(() => {
        isInitializing.current = false;
      });
    }
  }, [open, trip, form]);

  // Auto-fill endDate when startDate is set and endDate is empty
  const startDateValue = form.watch("startDate");
  useEffect(() => {
    if (isInitializing.current) return;
    if (startDateValue && !form.getValues("endDate")) {
      form.setValue("endDate", startDateValue);
    }
  }, [startDateValue, form]);

  const handleSubmit = (data: UpdateTripInput) => {
    updateTrip(
      { tripId: trip.id, data },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          const mapped = mapServerErrors(error, form.setError, {
            VALIDATION_ERROR: "name",
          });
          if (!mapped) {
            toast.error(
              getUpdateTripErrorMessage(error) ??
                "An unexpected error occurred.",
            );
          }
        },
      },
    );
  };

  const handleDelete = () => {
    cancelTrip(trip.id, {
      onSuccess: () => {
        toast.success("Trip deleted successfully");
      },
      onError: (error) => {
        toast.error(
          getCancelTripErrorMessage(error) ?? "An unexpected error occurred.",
        );
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Edit trip
          </SheetTitle>
          <SheetDescription>
            Update your trip details and settings
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              {/* Trip Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Trip name
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Bachelor Party in Miami"
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        disabled={isPending || isDeleting}
                        aria-required="true"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-muted-foreground">
                      Choose something memorable (3-100 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Destination */}
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Destination
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Miami Beach, FL"
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

              {/* Date Range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Start date
                      </FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="Start date"
                          aria-label="Start date"
                          disabled={isPending || isDeleting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        End date
                      </FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="End date"
                          aria-label="End date"
                          disabled={isPending || isDeleting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Timezone */}
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Trip timezone
                        <span className="text-destructive ml-1">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                        disabled={isPending || isDeleting}
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
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-sm text-muted-foreground">
                        All trip times will be shown in this timezone
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
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
                          placeholder="Tell your group about this trip..."
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
                      <FormDescription className="text-sm text-muted-foreground">
                        Optional: Share details about the trip
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Allow Members to Add Events */}
              <FormField
                control={form.control}
                name="allowMembersToAddEvents"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        name={field.name}
                        disabled={isPending || isDeleting}
                        aria-label="Allow members to add events"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-base font-semibold text-foreground cursor-pointer">
                        Allow members to add events
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground">
                        Let trip members create and propose events for the
                        itinerary
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* Show All Invited Members */}
              <FormField
                control={form.control}
                name="showAllMembers"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        name={field.name}
                        disabled={isPending || isDeleting}
                        aria-label="Show all invited members"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-base font-semibold text-foreground cursor-pointer">
                        Show all invited members
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground">
                        Let members see everyone invited, not just those going
                        or maybe
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={isPending || isDeleting}
                  variant="gradient"
                  size="lg"
                >
                  {isPending && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  {isPending ? "Updating trip..." : "Update trip"}
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
                      Delete trip
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you sure you want to delete this trip?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone.
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
