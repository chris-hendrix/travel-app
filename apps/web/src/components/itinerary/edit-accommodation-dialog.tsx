"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parse, addDays } from "date-fns";
import {
  updateAccommodationSchema,
  type UpdateAccommodationInput,
} from "@journiful/shared/schemas";
import type { Accommodation } from "@journiful/shared/types";
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
  useUpdateAccommodation,
  getUpdateAccommodationErrorMessage,
  useDeleteAccommodation,
  getDeleteAccommodationErrorMessage,
} from "@/hooks/use-accommodations";

interface EditAccommodationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodation: Accommodation;
  timezone: string;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function EditAccommodationDialog({
  open,
  onOpenChange,
  accommodation,
  timezone,
  onSuccess,
  tripStartDate,
  tripEndDate,
}: EditAccommodationDialogProps) {
  const { mutate: updateAccommodation, isPending } = useUpdateAccommodation();
  const { mutate: deleteAccommodation, isPending: isDeleting } =
    useDeleteAccommodation();
  const [newLink, setNewLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const isInitializing = useRef(false);

  const form = useForm<UpdateAccommodationInput>({
    resolver: zodResolver(updateAccommodationSchema),
    defaultValues: {
      name: "",
      address: "",
      description: "",
      checkIn: "",
      checkOut: "",
      links: [],
    },
  });

  // Pre-populate form with existing accommodation data when dialog opens
  useEffect(() => {
    if (open && accommodation) {
      isInitializing.current = true;
      form.reset({
        name: accommodation.name,
        address: accommodation.address || "",
        description: accommodation.description || "",
        checkIn: accommodation.checkIn,
        checkOut: accommodation.checkOut,
        links: accommodation.links || [],
      });
      setNewLink("");
      setLinkError(null);
      requestAnimationFrame(() => {
        isInitializing.current = false;
      });
    }
  }, [open, accommodation, form]);

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
    if (isInitializing.current) return;
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

  const handleSubmit = (data: UpdateAccommodationInput) => {
    updateAccommodation(
      { accommodationId: accommodation.id, data },
      {
        onSuccess: () => {
          toast.success("Accommodation updated successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(
            getUpdateAccommodationErrorMessage(error) ??
              "An unexpected error occurred.",
          );
        },
      },
    );
  };

  const handleDelete = () => {
    deleteAccommodation(accommodation.id, {
      onSuccess: () => {
        toast.success("Accommodation deleted");
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(
          getDeleteAccommodationErrorMessage(error) ??
            "Failed to delete accommodation",
        );
      },
    });
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
            Edit accommodation
          </SheetTitle>
          <SheetDescription>Update your accommodation details</SheetDescription>
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
                        disabled={isPending || isDeleting}
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
                        disabled={isPending || isDeleting}
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
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          timezone={timezone}
                          placeholder="Check-in"
                          aria-label="Check-in"
                          disabled={isPending || isDeleting}
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
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          timezone={timezone}
                          placeholder="Check-out"
                          aria-label="Check-out"
                          disabled={isPending || isDeleting}
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
                        Optional: Share details about the accommodation
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
                      Add related links (booking confirmation, hotel website,
                      etc.)
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
                              disabled={isPending || isDeleting}
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
                          disabled={isPending || isDeleting}
                          className="flex-1 h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                          aria-label="Link URL"
                          aria-describedby={
                            linkError
                              ? "edit-accommodation-link-error"
                              : undefined
                          }
                        />
                        <Button
                          type="button"
                          onClick={handleAddLink}
                          disabled={isPending || isDeleting}
                          className="h-12 px-4 bg-muted hover:bg-muted text-foreground rounded-md"
                          variant="outline"
                        >
                          <Plus className="w-5 h-5" />
                        </Button>
                      </div>
                      {linkError && (
                        <p
                          id="edit-accommodation-link-error"
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
                  {isPending ? "Updating..." : "Update accommodation"}
                </Button>
              </div>

              {/* Delete Button with AlertDialog */}
              <div className="flex justify-center pt-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={isPending || isDeleting}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed py-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete accommodation
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the accommodation. Organizers can
                        restore it later.
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
