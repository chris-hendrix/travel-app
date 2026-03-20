"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parse } from "date-fns";
import {
  updateMemberTravelSchema,
  type UpdateMemberTravelInput,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateMemberTravel,
  getUpdateMemberTravelErrorMessage,
  useDeleteMemberTravel,
  getDeleteMemberTravelErrorMessage,
} from "@/hooks/use-member-travel";
import { TIMEZONES } from "@/lib/constants";

interface EditMemberTravelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberTravel: MemberTravel;
  timezone: string;
  onSuccess?: () => void;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function EditMemberTravelDialog({
  open,
  onOpenChange,
  memberTravel,
  timezone,
  onSuccess,
  tripStartDate,
  tripEndDate,
}: EditMemberTravelDialogProps) {
  const { mutate: updateMemberTravel, isPending } = useUpdateMemberTravel();
  const { mutate: deleteMemberTravel, isPending: isDeleting } =
    useDeleteMemberTravel();
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);

  const form = useForm<UpdateMemberTravelInput>({
    resolver: zodResolver(updateMemberTravelSchema),
    defaultValues: {
      travelType: "arrival",
      time: "",
      location: "",
      details: "",
    },
  });

  const travelType = form.watch("travelType");
  const travelTypeLabel = travelType === "departure" ? "Departure" : "Arrival";

  // Pre-populate form with existing member travel data when dialog opens
  useEffect(() => {
    if (open && memberTravel) {
      form.reset({
        travelType: memberTravel.travelType,
        time: memberTravel.time
          ? new Date(memberTravel.time).toISOString()
          : "",
        location: memberTravel.location || "",
        details: memberTravel.details || "",
      });
      setSelectedTimezone(timezone);
    }
  }, [open, memberTravel, form, timezone]);

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

  const handleSubmit = (data: UpdateMemberTravelInput) => {
    updateMemberTravel(
      { memberTravelId: memberTravel.id, data },
      {
        onSuccess: () => {
          toast.success("Travel details updated successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(
            getUpdateMemberTravelErrorMessage(error) ??
              "An unexpected error occurred.",
          );
        },
      },
    );
  };

  const handleDelete = () => {
    deleteMemberTravel(memberTravel.id, {
      onSuccess: () => {
        toast.success("Travel details deleted");
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(
          getDeleteMemberTravelErrorMessage(error) ??
            "Failed to delete travel details",
        );
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Edit travel details
          </SheetTitle>
          <SheetDescription>Update your travel information</SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
              {/* Travel Type */}
              <FormField
                control={form.control}
                name="travelType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold text-foreground">
                      Travel type
                      <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <div
                        className="flex gap-4"
                        role="radiogroup"
                        aria-label="Travel type"
                        aria-required="true"
                      >
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            value="arrival"
                            checked={field.value === "arrival"}
                            onChange={() => field.onChange("arrival")}
                            disabled={isPending || isDeleting}
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">Arrival</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            value="departure"
                            checked={field.value === "departure"}
                            onChange={() => field.onChange("departure")}
                            disabled={isPending || isDeleting}
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">Departure</span>
                        </label>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Timezone */}
              <div>
                <label className="text-base font-semibold text-foreground">
                  Timezone
                </label>
                <Select
                  value={selectedTimezone}
                  onValueChange={setSelectedTimezone}
                  disabled={isPending || isDeleting}
                >
                  <SelectTrigger className="h-12 text-base rounded-md mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                        disabled={isPending || isDeleting}
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
                        disabled={isPending || isDeleting}
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
                          placeholder="Flight number, terminal, or other relevant details..."
                          className="h-32 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md resize-none"
                          disabled={isPending || isDeleting}
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
                  {isPending ? "Updating..." : "Update travel details"}
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
                      Delete travel details
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete your travel details. You can add them
                        again later.
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
