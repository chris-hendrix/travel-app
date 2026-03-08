"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTripSchema, type CreateTripInput } from "@tripful/shared";
import { THEME_PRESETS } from "@tripful/shared/config";
import { toast } from "sonner";
import { useCreateTrip, getCreateTripErrorMessage } from "@/hooks/use-trips";
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
import { ImageUpload } from "@/components/trip/image-upload";
import { ThemePicker } from "@/components/trip/theme-picker";
import { FontPicker } from "@/components/trip/font-picker";
import { useThemePreview } from "@/hooks/use-theme-preview";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2 } from "lucide-react";
import { TIMEZONES } from "@/lib/constants";

interface CreateTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTripDialog({
  open,
  onOpenChange,
}: CreateTripDialogProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const { mutate: createTrip, isPending } = useCreateTrip();

  const form = useForm({
    resolver: zodResolver(createTripSchema),
    defaultValues: {
      name: "",
      destination: "",
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
      "timezone",
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
      onSuccess: () => {
        onOpenChange(false);
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
          {/* Progress indicator */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-foreground">
                {currentStep === 1 ? "Trip details" : "Customize"}
              </span>
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of 2
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Step 1 circle */}
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                  currentStep >= 1
                    ? "bg-gradient-to-r from-primary to-accent text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                1
              </div>

              {/* Connecting line */}
              <div
                className={`flex-1 h-0.5 transition-colors ${
                  currentStep >= 2
                    ? "bg-gradient-to-r from-primary to-accent"
                    : "bg-muted"
                }`}
              />

              {/* Step 2 circle */}
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

                  {/* Timezone */}
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Trip timezone
                          <span className="text-destructive ml-1">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
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
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            name={field.name}
                            disabled={isPending}
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

                  {/* Continue Button */}
                  <div className="flex justify-end pt-4">
                    <Button
                      type="button"
                      onClick={handleContinue}
                      variant="gradient"
                      className="h-12 px-8 rounded-md"
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
                      className="flex-1 h-12 rounded-md border-input"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={isPending}
                      variant="gradient"
                      className="flex-1 h-12 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
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
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
