"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createPlaceholderSchema,
  updatePlaceholderSchema,
} from "@journiful/shared/schemas";
import type { MemberWithProfile } from "@journiful/shared/types";
import { useMembers } from "@/hooks/use-invitations";
import {
  useCreatePlaceholder,
  useUpdatePlaceholder,
} from "@/hooks/use-placeholders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { APIError } from "@/lib/api";

interface PlaceholderFormProps {
  tripId: string;
  /** Present => edit mode */
  placeholder?: MemberWithProfile | null;
  onSuccess: (member: MemberWithProfile) => void;
  /** Return to the previous in-sheet view */
  onCancel: () => void;
}

/**
 * Form-only placeholder add/edit — no Dialog/Sheet chrome.
 * Meant to be rendered in-place inside an existing sheet so we never
 * nest a dialog/sheet inside another sheet.
 */
export function PlaceholderForm({
  tripId,
  placeholder,
  onSuccess,
  onCancel,
}: PlaceholderFormProps) {
  const isEdit = !!placeholder?.isPlaceholder;
  const { data: members } = useMembers(tripId);
  const createPlaceholder = useCreatePlaceholder(tripId);
  const updatePlaceholder = useUpdatePlaceholder();

  const isPending = createPlaceholder.isPending || updatePlaceholder.isPending;
  const memberCount = members?.length ?? 0;
  const isAtLimit = !isEdit && memberCount >= 25;

  const form = useForm<{ name: string; phoneNumber?: string }>({
    resolver: zodResolver(
      (isEdit ? updatePlaceholderSchema : createPlaceholderSchema) as any,
    ) as any,
    defaultValues: {
      name: "",
    } as any,
  });

  // Sync form when placeholder changes (mounts in edit mode / switches person)
  useEffect(() => {
    const resetVals: { name: string; phoneNumber?: string } = {
      name: placeholder?.displayName ?? "",
    };
    if (placeholder?.phoneNumber) {
      resetVals.phoneNumber = placeholder.phoneNumber;
    }
    form.reset(resetVals as any);
    form.clearErrors();
  }, [placeholder, form]);

  const handleSubmit = form.handleSubmit((values) => {
    const payload = {
      name: values.name?.trim() ?? "",
      phoneNumber: values.phoneNumber || undefined,
    };

    // Guard empty name (zod already validates but keep UX tight)
    if (!payload.name) {
      form.setError("name", { message: "Name is required" });
      return;
    }

    if (isEdit && placeholder) {
      const updateData: { name?: string; phoneNumber?: string | null } = {};
      updateData.name = payload.name;
      if (payload.phoneNumber) {
        updateData.phoneNumber = payload.phoneNumber;
      } else if (payload.phoneNumber === undefined) {
        // If user cleared phone, send null to clear it
        // Only send null if original had a phone; otherwise omit
        if (placeholder.phoneNumber) {
          updateData.phoneNumber = null;
        }
      }
      updatePlaceholder.mutate(
        {
          memberId: placeholder.id,
          data: updateData,
        },
        {
          onSuccess: (member) => {
            toast.success("Person updated");
            onSuccess(member);
          },
          onError: (error) => {
            handleServerError(error);
          },
        },
      );
    } else {
      const createData: { name: string; phoneNumber?: string } = {
        name: payload.name,
      };
      if (payload.phoneNumber) {
        createData.phoneNumber = payload.phoneNumber;
      }
      createPlaceholder.mutate(createData, {
        onSuccess: (member) => {
          onSuccess(member);
        },
        onError: (error) => {
          handleServerError(error);
        },
      });
    }
  });

  function handleServerError(error: Error) {
    const message = error instanceof APIError ? error.message : error.message;
    const code = error instanceof APIError ? error.code : "";

    // 25-limit maps to MEMBER_LIMIT_EXCEEDED
    if (code === "MEMBER_LIMIT_EXCEEDED") {
      form.setError("name", {
        message: "Trip is full (25 members). Remove someone first.",
      });
      return;
    }

    // Duplicate phone: 23505 / unique / already exists
    const isDuplicate =
      code === "23505" ||
      message.toLowerCase().includes("duplicate") ||
      message.toLowerCase().includes("unique") ||
      message.toLowerCase().includes("already exists") ||
      message.toLowerCase().includes("members_trip_phone_unique");

    if (isDuplicate) {
      form.setError("phoneNumber", {
        message: "This phone number is already used for this trip.",
      });
      return;
    }

    // Phone-less invite handled by caller; here surface generic
    if (!isDuplicate) {
      const fallback =
        error instanceof APIError ? error.message : "An unexpected error occurred.";
      // Prefer phone field if error mentions phone
      if (message.toLowerCase().includes("phone")) {
        form.setError("phoneNumber", { message: fallback });
      } else {
        toast.error(fallback);
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Vivid Capri header avatar */}
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full border-2 border-dashed border-primary/30 bg-card flex items-center justify-center linen-texture overflow-hidden">
            <UserCircle className="size-7 text-primary/70" />
          </div>
          <div>
            <p className="font-playfair text-base font-semibold leading-none">
              {isEdit ? "Edit person" : "Add person"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Placeholder: someone you&apos;re planning for before inviting.
              They appear in the itinerary &amp; Settle; send an invite or link them later.
            </p>
          </div>
        </div>

        <FormField
          control={form.control as any}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel> Name</FormLabel>
              <FormControl>
                <Input
                  data-testid="add-placeholder-name"
                  placeholder="e.g., Alex Rivera"
                  maxLength={100}
                  aria-label="Person name"
                  disabled={isPending}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control as any}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Phone <span className="text-muted-foreground font-normal">(optional)</span>
              </FormLabel>
              <FormControl>
                <PhoneInput
                  value={field.value ?? ""}
                  onChange={(val) => field.onChange(val || undefined)}
                  placeholder="Enter phone number"
                  disabled={isPending}
                  aria-describedby={field.value ? undefined : undefined}
                  // forward data-testid via wrapper
                  className="[&>div>input]:data-[slot=input]"
                />
              </FormControl>
              {/* Hidden input to carry data-testid for RTL */}
              <input
                type="hidden"
                data-testid="add-placeholder-phone"
                value={field.value ?? ""}
                readOnly
              />
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                If added, you can send an SMS invite later.
              </p>
            </FormItem>
          )}
        />

        {isAtLimit && (
          <p className="text-sm text-destructive">
            Trip is full (25 members). Remove someone before adding.
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gradient"
            className="flex-1"
            disabled={isPending || isAtLimit}
            data-testid="add-placeholder-submit"
            aria-label={isEdit ? "Save person" : "Add person"}
          >
            {isPending ? (isEdit ? "Saving..." : "Adding...") : isEdit ? "Save" : "Add person"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
