"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { parse, addDays } from "date-fns";
import {
  createAccommodationSchema,
  type CreateAccommodationInput,
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  useCreateAccommodation,
  getCreateAccommodationErrorMessage,
} from "@/hooks/use-accommodations";

interface CreateAccommodationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  timezone: string;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function CreateAccommodationDialog({
  open,
  onOpenChange,
  tripId,
  timezone,
  onSuccess,
  tripStartDate,
  tripEndDate,
}: CreateAccommodationDialogProps) {
  const { mutate: createAccommodation, isPending } = useCreateAccommodation();
  const [newLink, setNewLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const form = useForm<CreateAccommodationInput>({
    resolver: zodResolver(createAccommodationSchema),
    defaultValues: {
      name: "",
      address: "",
      description: "",
      checkIn: "",
      checkOut: "",
      links: [],
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

  // Compute defaultMonth from watched checkIn for checkOut picker
  const checkInValue = form.watch("checkIn");
  const checkInMonth = useMemo(() => {
    if (!checkInValue) return undefined;
    const d = new Date(checkInValue);
    return isNaN(d.getTime()) ? undefined : d;
  }, [checkInValue]);

  // Auto-fill checkOut when checkIn is set and checkOut is empty or before checkIn (+1 day)
  useEffect(() => {
    if (checkInValue) {
      const currentOut = form.getValues("checkOut");
      if (!currentOut || new Date(currentOut) <= new Date(checkInValue)) {
        form.setValue(
          "checkOut",
          addDays(new Date(checkInValue), 1).toISOString(),
        );
      }
    }
  }, [checkInValue, form]);

  const handleSubmit = (data: CreateAccommodationInput) => {
    createAccommodation(
      { tripId, data },
      {
        onSuccess: () => {
          toast.success("Accommodation created successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(
            getCreateAccommodationErrorMessage(error) ??
              "An unexpected error occurred.",
          );
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
            Create a new accommodation
          </SheetTitle>
          <SheetDescription>
            Add an accommodation to your trip itinerary
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
              {/* Accommodation Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Accommodation name
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Oceanview Hotel"
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

              {/* Address */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Address
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="123 Beach Blvd, Miami Beach, FL 33139"
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Check-in and Check-out Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="checkIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Check-in
                        <span className="text-destructive ml-1">*</span>
                      </FormLabel>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          timezone={timezone}
                          placeholder="Check-in"
                          aria-label="Check-in"
                          disabled={isPending}
                          defaultMonth={tripStartMonth}
                          tripRange={tripRange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="checkOut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Check-out
                        <span className="text-destructive ml-1">*</span>
                      </FormLabel>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          timezone={timezone}
                          placeholder="Check-out"
                          aria-label="Check-out"
                          disabled={isPending}
                          defaultMonth={checkInMonth || tripStartMonth}
                          tripRange={tripRange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <CollapsibleSection label="More details">
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
                            placeholder="Tell your group about this accommodation..."
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

                {/* Links */}
                <FormField
                  control={form.control}
                  name="links"
                  render={() => (
                    <FormItem className="mt-6">
                      <FormLabel className="text-base font-semibold text-foreground">
                        Links
                      </FormLabel>

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
                              linkError ? "accommodation-link-error" : undefined
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
                            id="accommodation-link-error"
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
                  {isPending ? "Creating..." : "Create accommodation"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
