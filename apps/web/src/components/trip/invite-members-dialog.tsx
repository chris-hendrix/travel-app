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
import { PhoneInput } from "@/components/ui/phone-input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, X, UserPlus, Phone, Search, Users } from "lucide-react";
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

  const { mutate: inviteMembers, isPending } = useInviteMembers(tripId);
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

  const handleSubmit = (data: CreateInvitationsInput) => {
    inviteMembers(data, {
      onSuccess: (response) => {
        const invitedCount = response.invitations.length;
        const addedMembersCount = response.addedMembers?.length ?? 0;
        const skippedCount = response.skipped.length;
        const parts: string[] = [];
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
            {hasMutuals || isSuggestionsLoading
              ? "Select mutuals or add phone numbers to invite to this trip"
              : "Add phone numbers of people you want to invite to this trip"}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6 pb-6"
            >
              {/* Mutuals Section - loading skeleton */}
              {isSuggestionsLoading && (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <div className="space-y-1 rounded-md border border-border p-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="size-8 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="relative py-2">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
                      Or invite by phone number
                    </span>
                  </div>
                </div>
              )}

              {/* Mutuals Section - show when suggestions loaded */}
              {hasMutuals && !isSuggestionsLoading && (
                <div className="space-y-3" data-testid="mutuals-section">
                  <label className="text-base font-semibold text-foreground">
                    Suggest from mutuals
                  </label>

                  {/* Selected mutual chips */}
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
                            onClick={() => toggleMutual(mutual.id)}
                            disabled={isPending}
                            className="ml-1 hover:text-destructive transition-colors"
                            aria-label={`Remove ${mutual.displayName}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Search input for filtering */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={mutualSearch}
                      onChange={(e) => setMutualSearch(e.target.value)}
                      placeholder="Search mutuals..."
                      className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {/* Scrollable checkbox list */}
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                    {filteredSuggestions.length === 0 && mutualSearch.trim() ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                        No mutuals found
                      </div>
                    ) : (
                      filteredSuggestions.map((mutual: Mutual) => (
                        <label
                          key={mutual.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={userIds.includes(mutual.id)}
                            onCheckedChange={() => toggleMutual(mutual.id)}
                            aria-label={mutual.displayName}
                          />
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
                        </label>
                      ))
                    )}
                  </div>

                  {/* Divider before phone section */}
                  <div className="relative py-2">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
                      Or invite by phone number
                    </span>
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="phoneNumbers"
                render={() => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Phone numbers
                    </FormLabel>

                    {/* Phone chips */}
                    {phoneNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
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
                              disabled={isPending}
                              className="ml-1 hover:text-destructive transition-colors"
                              aria-label={`Remove ${phone}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Phone input */}
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
                            disabled={isPending}
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
                          disabled={isPending}
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

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
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
                  type="submit"
                  disabled={
                    isPending ||
                    (phoneNumbers.length === 0 && userIds.length === 0)
                  }
                  variant="gradient"
                  size="lg"
                  className="flex-1"
                >
                  {isPending && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
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
