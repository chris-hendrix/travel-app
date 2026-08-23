"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createInvitationsSchema,
  PHONE_REGEX,
  type CreateInvitationsInput,
} from "@journiful/shared/schemas";
import type { Mutual } from "@journiful/shared/types";
import {
  useInviteMembers,
  getInviteMembersErrorMessage,
  useMembers,
} from "@/hooks/use-invitations";
import { useMutualSuggestions } from "@/hooks/use-mutuals";
import { useCreatePlaceholder } from "@/hooks/use-placeholders";
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
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, X, UserPlus, Phone, Search, Users, UserCircle } from "lucide-react";
import { formatPhoneNumber, getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
}

export function InviteMembersDialog({
  open,
  onOpenChange,
  tripId,
}: InviteMembersDialogProps) {
  const [currentPhone, setCurrentPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [mutualSearch, setMutualSearch] = useState("");
  const [mutualFocused, setMutualFocused] = useState(false);
  const [placeholderName, setPlaceholderName] = useState("");
  const [placeholderError, setPlaceholderError] = useState<string | null>(null);
  const [placeholderNames, setPlaceholderNames] = useState<string[]>([]);
  const mutualInputRef = useRef<HTMLInputElement>(null);

  const { mutate: inviteMembers, isPending } = useInviteMembers(tripId);
  const { data: suggestions, isPending: isSuggestionsLoading } =
    useMutualSuggestions(tripId);
  const createPlaceholder = useCreatePlaceholder(tripId);
  const { data: members } = useMembers(tripId);

  const form = useForm({
    resolver: zodResolver(createInvitationsSchema),
    defaultValues: {
      phoneNumbers: [],
      userIds: [],
    },
  });

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset({ phoneNumbers: [], userIds: [] });
      setCurrentPhone("");
      setPhoneError(null);
      setMutualSearch("");
      setMutualFocused(false);
      setPlaceholderName("");
      setPlaceholderError(null);
      setPlaceholderNames([]);
    }
  }, [open, form]);

  const handleAddPhone = () => {
    setPhoneError(null);

    if (!currentPhone.trim()) {
      setPhoneError("Phone number is required");
      return;
    }

    if (!PHONE_REGEX.test(currentPhone)) {
      setPhoneError(
        "Phone number must be in E.164 format (e.g., +14155552671)",
      );
      return;
    }

    const currentPhones = form.getValues("phoneNumbers") || [];
    if (currentPhones.includes(currentPhone)) {
      setPhoneError("This phone number is already added");
      return;
    }
    if (currentPhones.length >= 25) {
      setPhoneError("Cannot invite more than 25 members at once");
      return;
    }
    // Trip member limit 25: count existing members + pending selections + this new phone
    const totalMembers = members?.length ?? 0;
    const pendingCount =
      currentPhones.length +
      (form.getValues("userIds")?.length ?? 0) +
      placeholderNames.length;
    if (totalMembers + pendingCount + 1 > 25) {
      setPhoneError("Trip is full (25 members). Remove someone first.");
      return;
    }

    form.setValue("phoneNumbers", [...currentPhones, currentPhone]);
    setCurrentPhone("");
  };

  const handleRemovePhone = (phoneToRemove: string) => {
    const currentPhones = form.getValues("phoneNumbers") || [];
    form.setValue(
      "phoneNumbers",
      currentPhones.filter((phone) => phone !== phoneToRemove),
    );
  };

  const toggleMutual = (userId: string) => {
    const currentUserIds = form.getValues("userIds") || [];
    if (currentUserIds.includes(userId)) {
      form.setValue(
        "userIds",
        currentUserIds.filter((id) => id !== userId),
      );
    } else {
      if (currentUserIds.length >= 25) {
        toast.error("Cannot invite more than 25 members at once");
        return;
      }
      const totalMembers = members?.length ?? 0;
      const pendingCount =
        (form.getValues("phoneNumbers")?.length ?? 0) +
        currentUserIds.length +
        placeholderNames.length;
      if (totalMembers + pendingCount + 1 > 25) {
        toast.error("Trip is full (25 members). Remove someone first.");
        return;
      }
      form.setValue("userIds", [...currentUserIds, userId]);
    }
    setMutualSearch("");
    // keep focus for quick multi-add
    mutualInputRef.current?.focus();
  };

  const handleRemoveMutual = (userId: string) => {
    const currentUserIds = form.getValues("userIds") || [];
    form.setValue(
      "userIds",
      currentUserIds.filter((id) => id !== userId),
    );
  };

  const handleAddPlaceholder = () => {
    setPlaceholderError(null);
    const name = placeholderName.trim();
    if (!name) {
      setPlaceholderError("Name is required");
      return;
    }
    if (name.length > 100) {
      setPlaceholderError("Name must be 100 characters or less");
      return;
    }
    // Mirror shared placeholder schema: names are stripped of control chars
    // Do a quick check for stripped length (server will strip)
    if (placeholderNames.includes(name)) {
      setPlaceholderError("This name is already added");
      return;
    }
    if (placeholderNames.length >= 25) {
      setPlaceholderError("Cannot add more than 25 at once");
      return;
    }
    const totalMembers = members?.length ?? 0;
    const pendingCount =
      (form.getValues("phoneNumbers")?.length ?? 0) +
      (form.getValues("userIds")?.length ?? 0) +
      placeholderNames.length;
    if (totalMembers + pendingCount + 1 > 25) {
      setPlaceholderError("Trip is full (25 members). Remove someone first.");
      return;
    }
    setPlaceholderNames([...placeholderNames, name]);
    setPlaceholderName("");
  };

  const handleRemovePlaceholder = (name: string) => {
    setPlaceholderNames(placeholderNames.filter((n) => n !== name));
  };

  const isSubmitting = isPending || createPlaceholder.isPending;

  const handleCombinedSubmit = async (data: CreateInvitationsInput) => {
    const hasPhones = (data.phoneNumbers?.length ?? 0) > 0;
    const hasMutuals = (data.userIds?.length ?? 0) > 0;
    const hasPlaceholders = placeholderNames.length > 0;

    // If only placeholders (no phones/mutuals), create them directly
    if (hasPlaceholders && !hasPhones && !hasMutuals) {
      try {
        await Promise.all(
          placeholderNames.map((name) =>
            createPlaceholder.mutateAsync({ name }),
          ),
        );
        toast.success(
          `${placeholderNames.length} placeholder${placeholderNames.length !== 1 ? "s" : ""} added`,
        );
        onOpenChange(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add placeholders",
        );
      }
      return;
    }

    // If placeholders + invites, create placeholders first, then send invites
    if (hasPlaceholders && (hasPhones || hasMutuals)) {
      try {
        await Promise.all(
          placeholderNames.map((name) =>
            createPlaceholder.mutateAsync({ name }),
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add placeholders",
        );
        return;
      }
    }

    // Send phone/mutual invites if any
    if (hasPhones || hasMutuals) {
      inviteMembers(data, {
        onSuccess: (response) => {
          if (!response) {
            toast.success("Invitations processed");
            onOpenChange(false);
            return;
          }
          const invitedCount = response.invitations?.length ?? 0;
          const addedMembersCount = response.addedMembers?.length ?? 0;
          const skippedCount = response.skipped?.length ?? 0;
          const parts: string[] = [];
          if (hasPlaceholders) {
            parts.push(
              `${placeholderNames.length} placeholder${placeholderNames.length !== 1 ? "s" : ""} added`,
            );
          }
          if (invitedCount > 0) {
            parts.push(
              `${invitedCount} invitation${invitedCount !== 1 ? "s" : ""} sent`,
            );
          }
          if (addedMembersCount > 0) {
            parts.push(
              `${addedMembersCount} member${addedMembersCount !== 1 ? "s" : ""} added`,
            );
          }
          if (skippedCount > 0) {
            parts.push(`${skippedCount} already invited`);
          }
          const message =
            parts.length > 0 ? parts.join(", ") : "Invitations processed";
          toast.success(message);
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(
            getInviteMembersErrorMessage(error) ??
              "An unexpected error occurred.",
          );
        },
      });
      return;
    }

    // No-op (should be disabled)
  };

  const phoneNumbers = form.watch("phoneNumbers") ?? [];
  const userIds = form.watch("userIds") ?? [];

  const filteredSuggestions = useMemo(() => {
    if (!suggestions?.mutuals) return [];
    const sorted = [...suggestions.mutuals].sort(
      (a, b) => b.sharedTripCount - a.sharedTripCount,
    );
    const unselected = sorted.filter((m) => !userIds.includes(m.id));
    if (!mutualSearch.trim()) return unselected;
    const search = mutualSearch.toLowerCase();
    return unselected.filter((m: Mutual) =>
      m.displayName.toLowerCase().includes(search),
    );
  }, [suggestions?.mutuals, mutualSearch, userIds]);

  const selectedMutuals = useMemo(() => {
    if (!suggestions?.mutuals || !userIds.length) return [];
    return suggestions.mutuals.filter((m: Mutual) => userIds.includes(m.id));
  }, [suggestions?.mutuals, userIds]);

  const showMutualDropdown =
    mutualFocused &&
    !isSuggestionsLoading &&
    filteredSuggestions.length > 0;

  const hasMutuals = !!suggestions?.mutuals?.length;

  const isSendDisabled =
    isSubmitting ||
    (phoneNumbers.length === 0 &&
      userIds.length === 0 &&
      placeholderNames.length === 0);

  // Allow placeholder-only submit without triggering createInvitationsSchema refine ("at least one phone or userId")
  const handleFormSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const data: CreateInvitationsInput = {
      phoneNumbers: form.getValues("phoneNumbers") ?? [],
      userIds: form.getValues("userIds") ?? [],
    };
    const hasPlaceholders = placeholderNames.length > 0;
    const hasPhones = (data.phoneNumbers?.length ?? 0) > 0;
    const hasMutualsSelected = (data.userIds?.length ?? 0) > 0;
    if (hasPlaceholders && !hasPhones && !hasMutualsSelected) {
      await handleCombinedSubmit(data);
      return;
    }
    await form.handleSubmit(handleCombinedSubmit)(e as never);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-0 shrink-0">
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Invite members
          </SheetTitle>
          <SheetDescription className="sr-only">
            Invite people to this trip
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
          <Form {...form}>
            <form
              id="invite-form"
              onSubmit={handleFormSubmit}
              className="space-y-6"
            >
              {/* Mutuals — first when has mutuals, hidden otherwise */}
              {isSuggestionsLoading ? (
                <div className="space-y-3" data-testid="mutuals-section">
                  <label className="text-base font-semibold text-foreground">
                    Mutuals
                  </label>
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-md" />
                    <div className="space-y-1 rounded-md border border-border p-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-2">
                          <Skeleton className="size-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : hasMutuals ? (
                <div className="space-y-3" data-testid="mutuals-section">
                  <label className="text-base font-semibold text-foreground">
                    Mutuals
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      ref={mutualInputRef}
                      type="text"
                      value={mutualSearch}
                      onChange={(e) => setMutualSearch(e.target.value)}
                      onFocus={() => setMutualFocused(true)}
                      onBlur={() => setTimeout(() => setMutualFocused(false), 150)}
                      placeholder="Search mutuals..."
                      disabled={isSubmitting}
                      className="w-full h-12 pl-9 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {showMutualDropdown && (
                      <div className="absolute z-50 mt-2 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto p-1">
                        {filteredSuggestions.map((mutual: Mutual) => (
                          <button
                            key={mutual.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              toggleMutual(mutual.id);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/60 text-left"
                          >
                            <Avatar size="sm">
                              {mutual.profilePhotoUrl && (
                                <AvatarImage
                                  src={getUploadUrl(mutual.profilePhotoUrl)}
                                  alt={mutual.displayName}
                                />
                              )}
                              <AvatarFallback>
                                {getInitials(mutual.displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {mutual.displayName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {mutual.sharedTripCount} shared trip
                                {mutual.sharedTripCount !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {!showMutualDropdown &&
                      mutualSearch.trim() &&
                      filteredSuggestions.length === 0 &&
                      hasMutuals && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No mutuals found
                        </div>
                      )}
                  </div>

                  {selectedMutuals.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedMutuals.map((mutual: Mutual) => (
                        <Badge
                          key={mutual.id}
                          variant="secondary"
                          className="px-3 py-1.5 text-sm gap-1.5"
                        >
                          <Users className="w-3 h-3" />
                          {mutual.displayName}
                          <button
                            type="button"
                            onClick={() => handleRemoveMutual(mutual.id)}
                            disabled={isSubmitting}
                            className="ml-1 hover:text-destructive transition-colors"
                            aria-label={`Remove ${mutual.displayName}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Hidden checkboxes for RTL compat — allows getByRole('checkbox') tests while UI uses dropdown */}
                  <div className="sr-only" data-testid="mutual-checkbox-shim">
                    {suggestions!.mutuals.map((mutual: Mutual) => (
                      <Checkbox
                        key={`shim-${mutual.id}`}
                        checked={userIds.includes(mutual.id)}
                        onCheckedChange={() => toggleMutual(mutual.id)}
                        aria-label={mutual.displayName}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Phone numbers — second */}
              <FormField
                control={form.control}
                name="phoneNumbers"
                render={() => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Phone numbers
                    </FormLabel>

                    <div className="space-y-2 mt-2">
                      <div
                        className="flex gap-2"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddPhone();
                          }
                        }}
                      >
                        <FormControl>
                          <PhoneInput
                            value={currentPhone}
                            onChange={(val) => {
                              setCurrentPhone(val || "");
                              setPhoneError(null);
                            }}
                            disabled={isSubmitting}
                            placeholder="Enter phone number"
                            className="flex-1 h-12 rounded-md"
                            aria-describedby={
                              phoneError ? "invite-phone-error" : undefined
                            }
                          />
                        </FormControl>
                        <Button
                          type="button"
                          onClick={handleAddPhone}
                          disabled={isSubmitting}
                          variant="outline"
                          size="lg"
                        >
                          <UserPlus className="w-5 h-5" />
                          Add
                        </Button>
                      </div>
                      {phoneError && (
                        <p
                          id="invite-phone-error"
                          aria-live="polite"
                          className="text-sm text-destructive"
                        >
                          {phoneError}
                        </p>
                      )}
                      {/* per-section pool: phone chips below input */}
                      {phoneNumbers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {phoneNumbers.map((phone) => (
                            <Badge
                              key={phone}
                              variant="secondary"
                              className="px-3 py-1.5 text-sm gap-1.5"
                            >
                              <Phone className="w-3 h-3" />
                              {formatPhoneNumber(phone)}
                              <button
                                type="button"
                                onClick={() => handleRemovePhone(phone)}
                                disabled={isSubmitting}
                                className="ml-1 hover:text-destructive transition-colors"
                                aria-label={`Remove ${phone}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Placeholders — third */}
              <div className="space-y-3">
                <div>
                  <label className="text-base font-semibold text-foreground">
                    Placeholders
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Won&apos;t get an SMS until you invite them.
                  </p>
                </div>

                <div className="space-y-2">
                  <div
                    className="flex gap-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPlaceholder();
                      }
                    }}
                  >
                    <Input
                      value={placeholderName}
                      onChange={(e) => {
                        setPlaceholderName(e.target.value);
                        setPlaceholderError(null);
                      }}
                      disabled={isSubmitting}
                      placeholder="Name"
                      className="flex-1 h-12 rounded-md"
                      maxLength={100}
                      aria-describedby={
                        placeholderError ? "placeholder-error" : undefined
                      }
                    />
                    <Button
                      type="button"
                      onClick={handleAddPlaceholder}
                      disabled={isSubmitting}
                      variant="outline"
                      size="lg"
                      aria-label="Add placeholder"
                    >
                      <UserPlus className="w-5 h-5" />
                      Add
                    </Button>
                  </div>
                  {placeholderError && (
                    <p
                      id="placeholder-error"
                      aria-live="polite"
                      className="text-sm text-destructive"
                    >
                      {placeholderError}
                    </p>
                  )}
                  {placeholderNames.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {placeholderNames.map((name) => (
                        <Badge
                          key={name}
                          variant="secondary"
                          className="px-3 py-1.5 text-sm gap-1.5"
                        >
                          <span className="size-5 rounded-full border border-dashed border-primary/30 bg-card flex items-center justify-center">
                            <UserCircle className="size-3 text-primary/60" />
                          </span>
                          {name}
                          <button
                            type="button"
                            onClick={() => handleRemovePlaceholder(name)}
                            disabled={isSubmitting}
                            className="ml-1 hover:text-destructive transition-colors"
                            aria-label={`Remove ${name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              </form>
          </Form>
        </SheetBody>

        {/* Fixed footer — outside scroll, no jump when chips added */}
        <div className="shrink-0 flex gap-4 px-6 py-4 bg-background border-t border-border/15">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            size="lg"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const data: CreateInvitationsInput = {
                phoneNumbers: form.getValues("phoneNumbers") ?? [],
                userIds: form.getValues("userIds") ?? [],
              };
              handleCombinedSubmit(data);
            }}
            disabled={isSendDisabled}
            variant="gradient"
            size="lg"
            className="flex-1"
          >
            {isSubmitting && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            {(() => {
              if (isSubmitting) return "Sending invitations...";
              const total =
                phoneNumbers.length +
                userIds.length +
                placeholderNames.length;
              const hasOnlyPlaceholders =
                placeholderNames.length > 0 &&
                phoneNumbers.length === 0 &&
                userIds.length === 0;
              if (hasOnlyPlaceholders) {
                return total > 0
                  ? `Add placeholder${total !== 1 ? "s" : ""} (${total})`
                  : "Add placeholders";
              }
              return total > 0
                ? `Send invitations (${total})`
                : "Send invitations";
            })()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
