"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTripSchema, type CreateTripInput } from "@journiful/shared";
import { THEME_PRESETS } from "@journiful/shared/config";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useCreateTrip, useUpdateTrip, getCreateTripErrorMessage } from "@/hooks/use-trips";
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
import { LocationInput } from "@/components/ui/location-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/trip/image-upload";
import { ThemePicker } from "@/components/trip/theme-picker";
import { FontPicker } from "@/components/trip/font-picker";
import { useThemePreview } from "@/hooks/use-theme-preview";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2 } from "lucide-react";
import { TIMEZONES } from "@/lib/constants";
import type { Trip } from "@journiful/shared/types";

interface CreateTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTripDialog({
  open,
  onOpenChange,
}: CreateTripDialogProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [createdTrip, setCreatedTrip] = useState<Trip | null>(null);
  const [pendingTimezone, setPendingTimezone] = useState<string>("");
  const router = useRouter();
  const { mutate: createTrip, isPending } = useCreateTrip();
  const { mutate: updateTrip, isPending: isUpdatingTimezone } = useUpdateTrip();

  const form = useForm({
    resolver: zodResolver(createTripSchema),
    defaultValues: {
      name: "",
      destination: "",
      destinationLat: null,
      destinationLon: null,
      startDate: undefined,
      endDate: undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      description: "",
      coverImageUrl: null,
      themeId: null,
      themeFont: null,
      allowMembersToAddEvents: true,
      coOrganizerPhones: [],
    },
  });

  // Reset to step 1 when dialog closes so next open starts fresh
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setCreatedTrip(null);
      setPendingTimezone("");
    }
  }, [open]);

  const watchedThemeId = form.watch("themeId");
  const watchedThemeFont = form.watch("themeFont");

  useThemePreview({
    themeId: watchedThemeId ?? null,
    themeFont: watchedThemeFont ?? null,
    initialThemeId: null,
    initialThemeFont: null,
    enabled: open,
  });

  // Auto-suggest font when theme changes and no font is set yet
  const prevThemeId = useRef(watchedThemeId);
  useEffect(() => {
    if (watchedThemeId !== prevThemeId.current) {
      prevThemeId.current = watchedThemeId;
      if (watchedThemeId && !form.getValues("themeFont")) {
        const preset = THEME_PRESETS.find((p) => p.id === watchedThemeId);
        if (preset?.suggestedFont) {
          form.setValue("themeFont", preset.suggestedFont);
        }
      }
    }
  }, [watchedThemeId, form]);

  const handleContinue = async () => {
    // Validate Step 1 fields before proceeding
    const step1Fields: (keyof CreateTripInput)[] = [
      "name",
      "destination",
      "startDate",
      "endDate",
    ];

    const isStep1Valid = await form.trigger(step1Fields);

    if (isStep1Valid) {
      setCurrentStep(2);
    }
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const handleSubmit = (data: CreateTripInput) => {
    createTrip(data, {
      onSuccess: (trip) => {
        setCreatedTrip(trip);
        setPendingTimezone(trip.preferredTimezone);
        setCurrentStep(3);
      },
      onError: (error) => {
        const mapped = mapServerErrors(error, form.setError, {
          VALIDATION_ERROR: "name",
        });
        if (!mapped) {
          toast.error(
            getCreateTripErrorMessage(error) ?? "An unexpected error occurred.",
          );
        }
      },
    });
  };

  const handleTimezoneConfirm = () => {
    if (!createdTrip) return;
    if (pendingTimezone !== createdTrip.preferredTimezone) {
      updateTrip(
        { tripId: createdTrip.id, data: { timezone: pendingTimezone } },
        {
          onSuccess: () => {
            onOpenChange(false);
            router.push(`/trips/${createdTrip.id}`);
          },
        },
      );
    } else {
      onOpenChange(false);
      router.push(`/trips/${createdTrip.id}`);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Create a new trip
          </SheetTitle>
          <SheetDescription>
            Plan your next adventure with friends and family
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {/* Progress indicator — hidden on step 3 */}
          {currentStep !== 3 && (
            <div className="mb-4">
              <div className="mb-3">
                <span className="text-sm font-medium text-foreground">
                  {currentStep === 1 ? "Trip details" : "Customize"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                    currentStep >= 1
                      ? "bg-gradient-to-r from-primary to-accent text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  1
                </div>
                <div
                  className={`flex-1 h-0.5 transition-colors ${
                    currentStep >= 2
                      ? "bg-gradient-to-r from-primary to-accent"
                      : "bg-muted"
                  }`}
                />
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                    currentStep >= 2
                      ? "bg-gradient-to-r from-primary to-accent text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  2
                </div>
              </div>
            </div>
          )}

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6 pb-6"
            >
              {currentStep === 1 && (
                <div className="space-y-4">
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
                            aria-required="true"
                            {...field}
                          />
                        </FormControl>
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
                          <LocationInput
                            name={field.name}
                            value={field.value ?? ""}
                            onChange={(val) => {
                              field.onChange(val);
                              form.setValue("destinationLat", null);
                              form.setValue("destinationLon", null);
                            }}
                            onSelect={(result) => {
                              field.onChange(result.shortName);
                              form.setValue("destinationLat", result.lat);
                              form.setValue("destinationLon", result.lon);
                            }}
                            placeholder="Miami Beach, FL"
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
                              onChange={(value) => {
                                field.onChange(value);
                                if (value && !form.getValues("endDate")) {
                                  form.setValue("endDate", value);
                                }
                              }}
                              placeholder="Start date"
                              aria-label="Start date"
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
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* Continue Button */}
                  <div className="flex justify-end pt-4">
                    <Button
                      type="button"
                      onClick={handleContinue}
                      variant="gradient"
                      size="lg"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  {/* Cover Image */}
                  <FormField
                    control={form.control}
                    name="coverImageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Cover photo
                        </FormLabel>
                        <FormControl>
                          <ImageUpload
                            value={field.value ?? null}
                            onChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormDescription className="text-sm text-muted-foreground">
                          Optional: Upload a cover image for your trip
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Theme */}
                  <FormField
                    control={form.control}
                    name="themeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Theme
                        </FormLabel>
                        <FormControl>
                          <ThemePicker
                            value={field.value ?? null}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormDescription className="text-sm text-muted-foreground">
                          Choose a visual theme for your trip
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  {/* Font */}
                  <FormField
                    control={form.control}
                    name="themeFont"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Font
                        </FormLabel>
                        <FormControl>
                          <FontPicker
                            value={field.value ?? null}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormDescription className="text-sm text-muted-foreground">
                          Choose a font for trip titles
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  {/* Action Buttons */}
                  <div className="flex gap-4 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBack}
                      disabled={isPending}
                      size="lg"
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={isPending}
                      variant="gradient"
                      size="lg"
                      className="flex-1"
                    >
                      {isPending && (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      )}
                      {isPending ? "Creating trip..." : "Create trip"}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </Form>

          {/* Step 3: Timezone confirmation */}
          {currentStep === 3 && createdTrip && (
            <div className="space-y-6 pb-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {createdTrip.timezoneAutoUpdated
                    ? `We detected the timezone for ${createdTrip.destination}.`
                    : `We couldn't detect a timezone for ${createdTrip.destination}. Your local timezone is set below — confirm it's right for your destination.`}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-base font-semibold text-foreground">
                  Trip timezone
                </label>
                <Select
                  value={pendingTimezone}
                  onValueChange={setPendingTimezone}
                >
                  <SelectTrigger className="w-full h-12 text-base rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingTimezone && !TIMEZONES.find((tz) => tz.value === pendingTimezone) && (
                      <SelectItem value={pendingTimezone}>{pendingTimezone}</SelectItem>
                    )}
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createdTrip.timezoneAutoUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Auto-detected from your destination
                  </p>
                )}
              </div>

              <Button
                onClick={handleTimezoneConfirm}
                disabled={isUpdatingTimezone}
                variant="gradient"
                size="lg"
                className="w-full"
              >
                {isUpdatingTimezone && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                {isUpdatingTimezone ? "Saving..." : "Go to trip"}
              </Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
