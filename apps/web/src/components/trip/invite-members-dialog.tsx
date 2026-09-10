"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "@/hooks/use-invitations";
import { useMutualSuggestions } from "@/hooks/use-mutuals";
import { useQueryClient } from "@tanstack/react-query";
import { memberKeys } from "@/hooks/invitation-queries";
import { tripKeys } from "@/hooks/trip-queries";
import { apiRequest, APIError } from "@/lib/api";
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
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PhoneInput } from "@/components/ui/phone-input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, X, Search, Check } from "lucide-react";
import { formatPhoneNumber, getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
}

const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-widest text-muted-foreground";

// Borderless inner phone input for the joined [input | button] rows —
// same pattern as GuestEditor in member-profile-sheet.tsx.
const JOINED_PHONE_INPUT =
  "min-w-0 flex-1 items-center px-3 [&_input]:h-11 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-1 [&_input]:shadow-none [&_input]:focus-visible:ring-0";

function DismissButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 transition-colors hover:bg-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <X className="size-3.5" />
    </button>
  );
}

export function InviteMembersDialog({
  open,
  onOpenChange,
  tripId,
}: InviteMembersDialogProps) {
  const [currentPhone, setCurrentPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [mutualSearch, setMutualSearch] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guests, setGuests] = useState<Array<{ name: string; phone?: string }>>([]);

  const queryClient = useQueryClient();
  const { mutateAsync: inviteMembersAsync, isPending } = useInviteMembers(tripId);
  const { data: suggestions, isPending: isSuggestionsLoading } =
    useMutualSuggestions(tripId);

  const form = useForm({
    resolver: zodResolver(createInvitationsSchema),
    defaultValues: {
      phoneNumbers: [],
      userIds: [],
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset({ phoneNumbers: [], userIds: [] });
      setCurrentPhone("");
      setPhoneError(null);
      setMutualSearch("");
      setGuestName("");
      setGuestPhone("");
      setGuestError(null);
      setGuests([]);
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
      form.setValue("userIds", [...currentUserIds, userId]);
    }
  };

  const handleAddGuest = () => {
    setGuestError(null);
    const name = guestName.trim();
    if (!name) {
      setGuestError("Guest name is required");
      return;
    }
    const phone = guestPhone.trim() ? guestPhone.trim() : undefined;
    if (phone && !PHONE_REGEX.test(phone)) {
      setGuestError("Phone number must be in E.164 format (e.g., +14155552671)");
      return;
    }
    if (phone) {
      const guestPhones = guests.map((g) => g.phone).filter(Boolean) as string[];
      const invitePhones = form.getValues("phoneNumbers") || [];
      if (guestPhones.includes(phone) || invitePhones.includes(phone)) {
        setGuestError("This phone number is already added");
        return;
      }
    }
    setGuests((prev) => [...prev, { name, ...(phone ? { phone } : {}) }]);
    setGuestName("");
    setGuestPhone("");
  };

  const handleRemoveGuest = (index: number) => {
    setGuests((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitInvalid = () => {
    // zod refine requires ≥1 phone/userId; guests-only submits bypass
    // validation via the submit button's onClick (onSubmitClick). If the
    // native form submit lands here with guests queued, submit anyway.
    if (guests.length > 0) {
      void handleSubmit(form.getValues() as CreateInvitationsInput);
    }
  };

  const onSubmitClick = () => {
    const data = form.getValues() as CreateInvitationsInput;
    void handleSubmit(data);
  };

  const handleSubmit = async (data: CreateInvitationsInput) => {
    const hasInvites =
      (data.phoneNumbers?.length ?? 0) > 0 || (data.userIds?.length ?? 0) > 0;
    const pendingGuests = [...guests];
    try {
      const toastParts: string[] = [];
      if (hasInvites) {
        const response = await inviteMembersAsync(data);
        const invitedCount = response.invitations.length;
        const addedMembersCount = response.addedMembers?.length ?? 0;
        const skippedCount = response.skipped.length;
        if (invitedCount > 0) {
          toastParts.push(
            `${invitedCount} invitation${invitedCount !== 1 ? "s" : ""} sent`,
          );
        }
        if (addedMembersCount > 0) {
          toastParts.push(
            `${addedMembersCount} member${addedMembersCount !== 1 ? "s" : ""} added`,
          );
        }
        if (skippedCount > 0) {
          toastParts.push(`${skippedCount} already invited`);
        }
      }
      const addedGuests: string[] = [];
      const skippedGuests: string[] = [];
      for (const g of pendingGuests) {
        try {
          await apiRequest(`/trips/${tripId}/members/guests`, {
            method: "POST",
            body: JSON.stringify({
              displayName: g.name,
              ...(g.phone ? { guestPhone: g.phone } : {}),
            }),
          });
          addedGuests.push(g.name);
        } catch (err) {
          if (err instanceof APIError && err.code === "DUPLICATE_MEMBER") {
            skippedGuests.push(g.name);
            toast.error(`${g.name} is already in this trip`);
          } else {
            throw err;
          }
        }
      }
      if (addedGuests.length > 0) {
        toastParts.push(
          `${addedGuests.length} guest${addedGuests.length !== 1 ? "s" : ""} added`,
        );
      }
      if (skippedGuests.length > 0) {
        toastParts.push(`Skipped: ${skippedGuests.join(", ")}`);
      }
      if (addedGuests.length > 0 || skippedGuests.length > 0 || hasInvites) {
        queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
        queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      }
      const message =
        toastParts.length > 0 ? toastParts.join(", ") : "Invitations processed";
      toast.success(message);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getInviteMembersErrorMessage(error as Error) ??
          "An unexpected error occurred.",
      );
    }
  };

  const phoneNumbers = form.watch("phoneNumbers") ?? [];
  const userIds = form.watch("userIds") ?? [];

  const hasMutuals = suggestions?.mutuals && suggestions.mutuals.length > 0;

  const filteredSuggestions = useMemo(() => {
    if (!suggestions?.mutuals) return [];
    if (!mutualSearch.trim()) return suggestions.mutuals;
    const search = mutualSearch.toLowerCase();
    return suggestions.mutuals.filter((m: Mutual) =>
      m.displayName.toLowerCase().includes(search),
    );
  }, [suggestions?.mutuals, mutualSearch]);

  // Build a lookup map for selected mutuals (for chip display)
  const selectedMutuals = useMemo(() => {
    if (!suggestions?.mutuals || !userIds.length) return [];
    return suggestions.mutuals.filter((m: Mutual) => userIds.includes(m.id));
  }, [suggestions?.mutuals, userIds]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Invite members
          </SheetTitle>
          <SheetDescription>
            Three ways, one list — pick mutuals, add phone numbers, or add
            guests without an account.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit, handleSubmitInvalid)}
              className="space-y-7 pb-6"
            >
              {/* Mutuals Section - loading skeleton */}
              {isSuggestionsLoading && (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <div className="space-y-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="size-5 rounded-full" />
                        <Skeleton className="size-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mutuals Section - show when suggestions loaded */}
              {hasMutuals && !isSuggestionsLoading && (
                <div className="space-y-3" data-testid="mutuals-section">
                  <p className={SECTION_LABEL}>From your mutuals · or</p>

                  {/* Selected mutual chips */}
                  {selectedMutuals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMutuals.map((mutual: Mutual) => (
                        <Badge
                          key={mutual.id}
                          variant="secondary"
                          className="gap-1.5 py-1.5 pl-3 pr-1.5 text-sm"
                        >
                          {mutual.displayName}
                          <DismissButton
                            label={`Remove ${mutual.displayName}`}
                            onClick={() => toggleMutual(mutual.id)}
                            disabled={isPending}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Search input for filtering */}
                  <div className="relative">
                    <Search
                      aria-hidden
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <label htmlFor="invite-mutual-search" className="sr-only">
                      Search mutuals
                    </label>
                    <input
                      id="invite-mutual-search"
                      type="text"
                      value={mutualSearch}
                      onChange={(e) => setMutualSearch(e.target.value)}
                      placeholder="Search mutuals..."
                      disabled={isPending}
                      className="h-12 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-2 focus:outline-ring"
                    />
                  </div>

                  {/* Tap-to-toggle rows */}
                  <div
                    role="group"
                    aria-label="Mutuals to invite"
                    className="max-h-48 space-y-0.5 overflow-y-auto"
                  >
                    {filteredSuggestions.length === 0 && mutualSearch.trim() ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        <Search
                          aria-hidden
                          className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50"
                        />
                        No mutuals found
                      </div>
                    ) : (
                      filteredSuggestions.map((mutual: Mutual) => {
                        const selected = userIds.includes(mutual.id);
                        return (
                          <button
                            key={mutual.id}
                            type="button"
                            aria-pressed={selected}
                            aria-label={`Invite ${mutual.displayName}`}
                            onClick={() => toggleMutual(mutual.id)}
                            disabled={isPending}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring",
                              selected && "bg-muted",
                            )}
                          >
                            <Avatar size="sm">
                              {mutual.profilePhotoUrl && (
                                <AvatarImage
                                  src={getUploadUrl(mutual.profilePhotoUrl)}
                                  alt=""
                                />
                              )}
                              <AvatarFallback>
                                {getInitials(mutual.displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {mutual.displayName}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {mutual.sharedTripCount} shared trip
                                {mutual.sharedTripCount !== 1 ? "s" : ""}
                              </span>
                            </span>
                            {selected ? (
                              <span
                                aria-hidden
                                className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                              >
                                <Check className="size-3.5" />
                              </span>
                            ) : (
                              <span
                                aria-hidden
                                className="size-[22px] shrink-0 rounded-full border-[1.5px] border-muted-foreground"
                              />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="phoneNumbers"
                render={() => (
                  <FormItem>
                    <p className={SECTION_LABEL}>By phone number · or</p>

                    {/* Phone chips */}
                    {phoneNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {phoneNumbers.map((phone) => (
                          <Badge
                            key={phone}
                            variant="secondary"
                            className="gap-1.5 py-1.5 pl-3 pr-1.5 text-sm"
                          >
                            {formatPhoneNumber(phone)}
                            <DismissButton
                              label={`Remove ${phone}`}
                              onClick={() => handleRemovePhone(phone)}
                              disabled={isPending}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Joined phone row — mirrors the guest-sheet pattern */}
                    <div className="space-y-2 pt-1">
                      <div
                        className="flex h-12 items-stretch overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring focus-within:outline-2 focus-within:outline-ring"
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
                            disabled={isPending}
                            placeholder="Enter phone number"
                            className={JOINED_PHONE_INPUT}
                            aria-describedby={
                              phoneError ? "invite-phone-error" : undefined
                            }
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleAddPhone}
                          disabled={isPending}
                          aria-label="Add phone number"
                          className="h-full shrink-0 rounded-none rounded-r-lg border-l border-input px-4 text-sm font-semibold"
                        >
                          Add
                        </Button>
                      </div>
                      {phoneError && (
                        <p
                          id="invite-phone-error"
                          role="alert"
                          className="text-sm text-destructive"
                        >
                          {phoneError}
                        </p>
                      )}
                      {phoneNumbers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {phoneNumbers.length} phone number
                          {phoneNumbers.length !== 1 ? "s" : ""} added
                        </p>
                      )}
                    </div>

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Guest section — no account needed */}
              <div className="space-y-3" data-testid="guest-section">
                <p className={SECTION_LABEL}>As a guest</p>
                <p className="-mt-1 text-xs text-muted-foreground">
                  No app needed — you plan for them, they can claim their spot
                  later.
                </p>

                {guests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="guest-chips">
                    {guests.map((g, i) => (
                      <Badge
                        key={`${g.name}-${i}`}
                        className="gap-1.5 bg-accent py-1.5 pl-3 pr-1.5 text-sm text-accent-foreground hover:bg-accent/90"
                      >
                        {g.name}
                        <DismissButton
                          label={`Remove guest ${g.name}`}
                          onClick={() => handleRemoveGuest(i)}
                          disabled={isPending}
                        />
                      </Badge>
                    ))}
                  </div>
                )}

                <div
                  className="space-y-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddGuest();
                    }
                  }}
                >
                  <Input
                    value={guestName}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                      setGuestError(null);
                    }}
                    disabled={isPending}
                    placeholder="Guest name"
                    aria-label="Guest name"
                    className="h-12 rounded-lg"
                  />
                  <div className="flex h-12 items-stretch overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring focus-within:outline-2 focus-within:outline-ring">
                    <PhoneInput
                      value={guestPhone}
                      onChange={(val) => {
                        setGuestPhone(val || "");
                        setGuestError(null);
                      }}
                      disabled={isPending}
                      placeholder="Phone (optional)"
                      className={JOINED_PHONE_INPUT}
                      aria-label="Guest phone (optional)"
                      aria-describedby={guestError ? "invite-guest-error" : undefined}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleAddGuest}
                      disabled={isPending || guestName.trim().length === 0}
                      aria-label="Add guest"
                      className="h-full shrink-0 rounded-none rounded-r-lg border-l border-input px-4 text-sm font-semibold"
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add saves name + phone together as one guest.
                  </p>
                  {guestError && (
                    <p
                      id="invite-guest-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {guestError}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  size="lg"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onSubmitClick}
                  disabled={
                    isPending ||
                    (phoneNumbers.length === 0 &&
                      userIds.length === 0 &&
                      guests.length === 0)
                  }
                  variant="gradient"
                  size="lg"
                  className="flex-1"
                >
                  {isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isPending ? "Sending invitations..." : "Send invitations"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
