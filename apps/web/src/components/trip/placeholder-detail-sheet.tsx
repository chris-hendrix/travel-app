"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Search, UserCircle } from "lucide-react";
import type { MemberWithProfile } from "@journiful/shared/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import {
  useUpdatePlaceholder,
  useAttachPlaceholder,
  useInvitePlaceholder,
  useDeletePlaceholder,
  getPlaceholderErrorMessage,
} from "@/hooks/use-placeholders";
import { useMutualSuggestions } from "@/hooks/use-mutuals";

interface PlaceholderDetailSheetProps {
  member: MemberWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  initialFocus?: "name" | "phone" | "mutual";
}

export function PlaceholderDetailSheet({
  member,
  open,
  onOpenChange,
  tripId,
  initialFocus,
}: PlaceholderDetailSheetProps) {
  const [name, setName] = useState(member?.displayName ?? "");
  const [phone, setPhone] = useState(member?.phoneNumber ?? "");
  const [showMutual, setShowMutual] = useState(false);
  const [mutualSearch, setMutualSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneWrapRef = useRef<HTMLDivElement>(null);

  const updatePlaceholder = useUpdatePlaceholder();
  const attachPlaceholder = useAttachPlaceholder(tripId);
  const invitePlaceholder = useInvitePlaceholder(tripId);
  const deletePlaceholder = useDeletePlaceholder(tripId);
  const { data: mutualSuggestions, isPending: mutualPending } = useMutualSuggestions(tripId);

  useEffect(() => {
    if (member) {
      setName(member.displayName);
      setPhone(member.phoneNumber ?? "");
    }
  }, [member]);

  useEffect(() => {
    if (!open) {
      setShowMutual(false);
      setMutualSearch("");
      setConfirmDelete(false);
      return;
    }
    const id = setTimeout(() => {
      if (initialFocus === "name") nameRef.current?.focus();
      else if (initialFocus === "phone") {
        const input = phoneWrapRef.current?.querySelector<HTMLInputElement>('input[type="tel"]');
        input?.focus();
      } else if (initialFocus === "mutual") setShowMutual(true);
    }, 120);
    return () => clearTimeout(id);
  }, [open, initialFocus]);

  if (!member || !member.isPlaceholder) return null;

  const handleNameSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === member.displayName) return;
    try {
      await updatePlaceholder.mutateAsync({ memberId: member.id, data: { name: trimmed } });
      toast.success("Name updated");
    } catch (error) {
      toast.error(getPlaceholderErrorMessage(error as Error) ?? "Failed to update name");
    }
  };

  const handleAttachPhone = async () => {
    if (!phone) return;
    try {
      await attachPlaceholder.mutateAsync({ memberId: member.id, phoneNumber: phone });
    } catch (error) {
      toast.error(getPlaceholderErrorMessage(error as Error) ?? "Failed to attach phone");
    }
  };

  const handleMutualSelect = async (targetUserId: string) => {
    try {
      await attachPlaceholder.mutateAsync({ memberId: member.id, targetUserId });
      onOpenChange(false);
    } catch (error) {
      toast.error(getPlaceholderErrorMessage(error as Error) ?? "Failed to link user");
    }
  };

  const handleSendInvite = async () => {
    if (!member.phoneNumber && !phone) {
      toast.error("Add a phone number first");
      return;
    }
    if (phone && phone !== member.phoneNumber) {
      try {
        await attachPlaceholder.mutateAsync({ memberId: member.id, phoneNumber: phone });
      } catch (error) {
        toast.error(getPlaceholderErrorMessage(error as Error) ?? "Failed to attach phone");
        return;
      }
    }
    try {
      await invitePlaceholder.mutateAsync(member.id);
      onOpenChange(false);
    } catch (error) {
      toast.error(getPlaceholderErrorMessage(error as Error) ?? "Failed to send invite");
    }
  };

  const handleDelete = async () => {
    try {
      await deletePlaceholder.mutateAsync(member.id);
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(getPlaceholderErrorMessage(error as Error) ?? "Failed to remove");
    }
  };

  const filteredMutuals = (mutualSuggestions?.mutuals ?? [])
    .filter((m) => {
      if (!mutualSearch) return true;
      return m.displayName.toLowerCase().includes(mutualSearch.toLowerCase());
    })
    .sort((a, b) => b.sharedTripCount - a.sharedTripCount);

  const hasPhone = !!(member.phoneNumber || phone);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="bg-card linen-texture flex flex-col p-0 gap-0"
          data-testid="placeholder-detail-sheet"
        >
          <SheetHeader className="pb-0">
            <SheetTitle className="text-3xl font-playfair tracking-tight text-left">
              {member.displayName}
            </SheetTitle>
            <SheetDescription className="sr-only">Manage placeholder {member.displayName}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-6 flex-1 overflow-y-auto">
            {/* Identity hint — subtle placeholder badge like members-list */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground -mt-2">
              <span className="inline-flex items-center justify-center size-5 rounded-full border border-dashed border-primary/30 bg-card">
                <UserCircle className="size-3 text-primary/60" />
              </span>
              <span>Placeholder — won&apos;t get an SMS until you invite them.</span>
            </div>

            {/* Name */}
            <div className="space-y-2 motion-safe:animate-[fadeIn_300ms_ease-out_both]">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="placeholder-detail-name"
              >
                Name
              </label>
              <Input
                id="placeholder-detail-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                placeholder="Name"
                className="h-12 bg-card"
                disabled={updatePlaceholder.isPending}
                data-testid="placeholder-name-input"
              />
            </div>

            {/* Phone */}
            <div
              className="space-y-2 motion-safe:animate-[fadeIn_300ms_ease-out_both]"
              style={{ animationDelay: "80ms" }}
            >
              <label className="text-sm font-medium text-foreground">Phone</label>
              <div className="flex gap-2 items-stretch">
                <div ref={phoneWrapRef} className="flex-1 min-w-0">
                  <PhoneInput
                    value={phone}
                    onChange={(val) => setPhone(val ?? "")}
                    placeholder="Phone number"
                    aria-label="Attach phone"
                  />
                </div>
                <Button
                  onClick={handleAttachPhone}
                  disabled={!phone || attachPlaceholder.isPending}
                  variant="outline"
                  className="h-12 shrink-0 bg-card px-5"
                  aria-label="Attach phone"
                  data-testid="attach-phone-button"
                >
                  {attachPlaceholder.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Attach"
                  )}
                </Button>
              </div>
              <button
                onClick={handleSendInvite}
                disabled={!hasPhone || invitePlaceholder.isPending}
                className="text-xs font-normal text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors"
                type="button"
                data-testid="send-invite-link"
              >
                {invitePlaceholder.isPending ? "Sending…" : "Send invite"}
              </button>
            </div>

            {/* Mutual link — collapsed per simplicity S1 */}
            {!showMutual ? (
              <button
                onClick={() => setShowMutual(true)}
                className="text-xs font-normal text-muted-foreground hover:text-foreground transition-colors motion-safe:animate-[fadeIn_300ms_ease-out_both]"
                style={{ animationDelay: "160ms" }}
                type="button"
                data-testid="show-mutual-button"
              >
                Or link a mutual
              </button>
            ) : (
              <div
                className="space-y-2 motion-safe:animate-[fadeIn_300ms_ease-out_both]"
                style={{ animationDelay: "160ms" }}
              >
                <label className="text-sm font-medium text-foreground">Link mutual</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search mutuals..."
                    value={mutualSearch}
                    onChange={(e) => setMutualSearch(e.target.value)}
                    className="h-12 pl-9 bg-card"
                    data-testid="mutual-search-input"
                    autoFocus
                  />
                </div>
                <div className="border border-border rounded-md shadow-lg bg-card max-h-[40vh] overflow-y-auto card-noise">
                  {mutualPending ? (
                    <div className="p-2 space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : filteredMutuals.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No mutuals available
                    </p>
                  ) : (
                    <div className="space-y-1 p-1">
                      {filteredMutuals.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleMutualSelect(m.id)}
                          disabled={attachPlaceholder.isPending}
                          className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/60 text-left transition-colors"
                          data-testid={`mutual-option-${m.id}`}
                        >
                          <Avatar size="sm">
                            <AvatarImage src={getUploadUrl(m.profilePhotoUrl)} alt={m.displayName} />
                            <AvatarFallback>{getInitials(m.displayName)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate flex-1">{m.displayName}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {m.sharedTripCount} trips
                          </span>
                          {attachPlaceholder.isPending && <Loader2 className="size-4 animate-spin" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </SheetBody>

          <SheetFooter className="p-6 pt-4 border-t border-border bg-card/50 backdrop-blur-sm flex-row justify-between sm:justify-between pb-safe">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
              data-testid="remove-placeholder-button"
            >
              Remove
            </Button>
            <Button variant="outline" size="sm" className="bg-card" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-card linen-texture">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-playfair">Remove {member.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This placeholder and any associated travel or payments will be removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePlaceholder.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deletePlaceholder.isPending}>
              {deletePlaceholder.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
