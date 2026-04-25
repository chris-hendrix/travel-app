"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, Loader2, Plus, X } from "lucide-react";
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
import {
  useCreateAccommodation,
  getCreateAccommodationErrorMessage,
} from "@/hooks/use-accommodations";
import { getTimezoneAbbr } from "@/lib/constants";

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
  const [newLink, setNewLink] = useState<{ url: string; name: string }>({
    url: "",
    name: "",
  });
  const [linkError, setLinkError] = useState<string | null>(null);

  const form = useForm<CreateAccommodationInput>({
    resolver: zodResolver(createAccommodationSchema),
    defaultValues: {
      name: "",
      address: "",
      description: "",
      checkIn: undefined,
      checkOut: undefined,
      links: [],
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setNewLink({ url: "", name: "" });
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
                      <FormLabel className="text-base font-semibold text-foreground flex items-center justify-between">
                        <span>Check-in</span>
                        <span className="inline-flex items-center gap-1 font-normal text-xs text-muted-foreground">
                          <Globe className="w-3 h-3" />
                          {getTimezoneAbbr(timezone)}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <DateTimePicker
                          value={field.value || ""}
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
                      </FormLabel>
                      <FormControl>
                        <DateTimePicker
                          value={field.value || ""}
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
                              disabled={isPending}
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
                          disabled={isPending}
                          className="flex-1 h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                          aria-label="Link URL"
                          aria-describedby={
                            linkError ? "accommodation-link-error" : undefined
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
                          disabled={isPending}
                          className="flex-1 h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                          aria-label="Link display name"
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
