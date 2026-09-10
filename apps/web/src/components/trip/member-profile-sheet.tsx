"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import type { MemberWithProfile } from "@journiful/shared/types";
import { PHONE_REGEX } from "@journiful/shared/schemas";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { isGuestMember } from "@/components/trip/guest-avatar";
import { RsvpPills } from "@/components/trip/rsvp-pills";
import { cn } from "@/lib/utils";
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";
import {
  useInvitations,
  useInviteMembers,
  useRemoveMember,
  getInviteMembersErrorMessage,
  getRemoveMemberErrorMessage,
} from "@/hooks/use-invitations";
import { useMutualSuggestions } from "@/hooks/use-mutuals";
import {
  useUpdateGuest,
  getUpdateGuestErrorMessage,
} from "@/hooks/use-guest-members";

interface MemberProfileSheetProps {
  member: MemberWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId?: string;
  isOrganizer?: boolean;
  onRemove?: (member: MemberWithProfile) => void;
}

function statusSuffix(
  status: MemberWithProfile["status"] | undefined,
): string {
  switch (status) {
    case "going":
      return " · Going";
    case "maybe":
      return " · Maybe";
    case "not_going":
      return " · Not going";
    case "no_response":
      return " · No response";
    default:
      return "";
  }
}


function GuestEditor({
  member,
  tripId,
  onRemove,
  onClaimed,
}: {
  member: MemberWithProfile;
  tripId: string;
  onRemove?: (member: MemberWithProfile) => void;
  onClaimed: () => void;
}) {
  const savedPhone = member.guestPhone ?? member.phoneNumber ?? "";

  const { data: invitations } = useInvitations(tripId, { enabled: true });
  const inviteMembers = useInviteMembers(tripId);
  const removeMember = useRemoveMember(tripId);
  const updateGuest = useUpdateGuest(tripId);
  const { data: suggestions } = useMutualSuggestions(tripId);

  const [rsvpPending, setRsvpPending] =
    useState<MemberWithProfile["status"] | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [phone, setPhone] = useState(savedPhone);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const savedPhoneRef = useRef(savedPhone);

  // Keep the phone draft in sync if the member row changes underneath us
  // (refetch after claim / remote edit). Only adopt the server value when the
  // draft is untouched — never clobber an in-progress edit. Focus is NOT the
  // gate: clicking Send blurs the input and must not reset the draft.
  useEffect(() => {
    const nextSaved = member.guestPhone ?? member.phoneNumber ?? "";
    if (nextSaved === savedPhoneRef.current) return;
    const untouched = phone.trim() === savedPhoneRef.current.trim();
    savedPhoneRef.current = nextSaved;
    if (untouched) setPhone(nextSaved);
    // Intentionally not listing `phone` in deps: this effect only reacts to
    // server-side member row changes and reads the draft via a ref pattern.
  }, [member.guestPhone, member.phoneNumber]);
  const [mutualError, setMutualError] = useState<string | null>(null);
  const [selectedMutualId, setSelectedMutualId] = useState<string>("");
  const [removeOpen, setRemoveOpen] = useState(false);

  const pendingInviteExists =
    !!savedPhone &&
    (invitations ?? []).some(
      (inv) => inv.inviteePhone === savedPhone && inv.status === "pending",
    );
  const phoneEdited = phone.trim() !== savedPhone.trim();
  const phoneValid = PHONE_REGEX.test(phone.trim());

  const mutuals =
    suggestions && "mutuals" in suggestions ? suggestions.mutuals : [];
  const selectedMutual = mutuals.find((m) => m.id === selectedMutualId) ?? null;

  const handleRsvp = async (value: MemberWithProfile["status"]) => {
    if (value === member.status || rsvpPending) return;
    setRsvpPending(value);
    setRsvpError(null);
    try {
      await updateGuest.mutateAsync({
        memberId: member.id,
        data: { status: value },
      });
    } catch (error) {
      setRsvpError(
        getUpdateGuestErrorMessage(error as Error) ?? "Failed to update RSVP",
      );
    } finally {
      setRsvpPending(null);
    }
  };

  const handleSend = async () => {
    const trimmed = phone.trim();
    if (!PHONE_REGEX.test(trimmed)) {
      setPhoneError("Enter a valid phone number");
      return;
    }
    setPhoneError(null);
    let guestUpdated = false;
    try {
      if (trimmed !== savedPhone.trim()) {
        await updateGuest.mutateAsync({
          memberId: member.id,
          data: { guestPhone: trimmed },
        });
        guestUpdated = true;
      }
      await inviteMembers.mutateAsync({
        phoneNumbers: [trimmed],
        userIds: [],
      });
      toast.success(`Invite sent to ${trimmed}`);
      // The guest row leaves the members list server-side (guest-to-invite
      // conversion); close the sheet explicitly so the organizer lands back
      // on the Invited tab phone row.
      onClaimed();
    } catch (error) {
      // Branch on which mutation threw: a post-update invite failure is an
      // invite error even though the APIError carries a `code` field.
      if (guestUpdated) {
        toast.error(
          getInviteMembersErrorMessage(error as Error) ??
            "Failed to send invite",
        );
      } else if (error instanceof Error && "code" in error) {
        setPhoneError(
          getUpdateGuestErrorMessage(error as Error) ??
            "Failed to send invite",
        );
      } else {
        toast.error(
          getInviteMembersErrorMessage(error as Error) ??
            "Failed to send invite",
        );
      }
    }
  };

  const handleClaim = async () => {
    if (!selectedMutual) return;
    setMutualError(null);
    try {
      await inviteMembers.mutateAsync({
        phoneNumbers: [],
        userIds: [selectedMutual.id],
      });
      toast.success(
        `${member.displayName} is now ${selectedMutual.displayName}`,
      );
      onClaimed();
    } catch (error) {
      setMutualError(
        getInviteMembersErrorMessage(error as Error) ??
          "Failed to attach member",
      );
    }
  };

  const handleRemove = async () => {
    try {
      if (onRemove) {
        onRemove(member);
      } else {
        await removeMember.mutateAsync(member.id);
        toast.success(`${member.displayName} removed from this trip`);
      }
      setRemoveOpen(false);
    } catch (error) {
      toast.error(
        getRemoveMemberErrorMessage(error as Error) ?? "Failed to remove guest",
      );
    }
  };

  const sendBusy = updateGuest.isPending || inviteMembers.isPending;

  return (
    <div className="space-y-5">
      {/* RSVP — pills are self-explanatory; sr-only label for a11y */}
      <div className="space-y-2">
        <div role="group" aria-label={`RSVP for ${member.displayName}`}>
          <RsvpPills
            includeNoResponse
            onSelect={handleRsvp}
            pending={rsvpPending}
            status={member.status}
          />
        </div>
        {rsvpError && (
          <p role="alert" className="text-xs text-destructive">
            {rsvpError}
          </p>
        )}
      </div>


      {/* Invite them */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Invite them
        </p>

        {/* Phone row */}
        <div className="space-y-1">
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring">
            <div
              className="flex min-w-0 flex-1 items-center gap-1 px-3"
            >
              <span aria-hidden className="text-muted-foreground">
                📱
              </span>
              <PhoneInput
                value={phone}
                onChange={(v) => setPhone(v ?? "")}
                placeholder="Phone number"
                aria-label="Guest phone number"
                className="min-w-0 flex-1 [&_input]:h-9 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-1 [&_input]:shadow-none [&_input]:focus-visible:ring-0"
              />
            </div>
            <Button
              type="button"
              onClick={handleSend}
              disabled={!phoneValid || sendBusy}
              variant={pendingInviteExists && !phoneEdited ? "ghost" : "default"}
              className="h-full shrink-0 rounded-none rounded-r-[calc(var(--radius)-1px)] border-l border-input px-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              {pendingInviteExists && !phoneEdited ? "Invite sent ✓" : "Send"}
            </Button>
          </div>
          {phoneError && (
            <p role="alert" className="text-xs text-destructive">
              {phoneError}
            </p>
          )}
        </div>

        {/* Mutual row */}
        <div className="space-y-1">
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring">
            <div className="flex min-w-0 flex-1 items-center px-1">
              <Select value={selectedMutualId} onValueChange={setSelectedMutualId}>
                <SelectTrigger
                  aria-label="Choose a mutual"
                  className="h-9 w-full border-0 bg-transparent shadow-none focus-visible:ring-0"
                >
                  <SelectValue placeholder="Choose a mutual…" />
                </SelectTrigger>
                <SelectContent>
                  {mutuals.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleClaim}
              disabled={!selectedMutual || inviteMembers.isPending}
              className="h-full shrink-0 rounded-none rounded-r-[calc(var(--radius)-1px)] border-l border-input px-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              Invite
            </Button>
          </div>
          {mutualError && (
            <p role="alert" className="text-xs text-destructive">
              {mutualError}
            </p>
          )}
        </div>
      </div>

      {/* Remove */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setRemoveOpen(true)}
          className="text-sm text-destructive/80 hover:text-destructive hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Remove guest
        </button>
      </div>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {member.displayName} from this trip? Their travel and
              expenses are removed too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function MemberProfileSheet({
  member,
  open,
  onOpenChange,
  tripId,
  isOrganizer = false,
  onRemove,
}: MemberProfileSheetProps) {
  const isGuest = !!member && isGuestMember(member);
  const showGuestEditor = isGuest && isOrganizer && !!tripId && !!member;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {showGuestEditor ? (
          <>
            {/* Identity zone — mirrors the standard member header:
                left-aligned Playfair title, description below, avatar
                centered in SheetBody */}
            <SheetHeader>
              <GuestNameTitle member={member} tripId={tripId as string} />
              <SheetDescription>
                Guest{statusSuffix(member?.status)}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <div className="space-y-5 pb-6">
                <div className="flex justify-center">
                  <Avatar
                    className="size-20 border-2 border-dashed border-accent text-xl"
                    data-testid={`member-avatar-${member.id}`}
                    data-guest-ring="dashed"
                  >
                    {member.profilePhotoUrl && (
                      <AvatarImage
                        src={getUploadUrl(member.profilePhotoUrl)}
                        alt={member.displayName}
                      />
                    )}
                    <AvatarFallback className="text-xl">
                      {getInitials(member.displayName)}
                    </AvatarFallback>
                  </Avatar>
                </div>


                <GuestEditor
                  member={member}
                  tripId={tripId as string}
                  onClaimed={() => onOpenChange(false)}
                  {...(onRemove ? { onRemove } : {})}
                />
              </div>
            </SheetBody>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                {member?.displayName ?? ""}
              </SheetTitle>
              <SheetDescription>
                {isGuest ? (
                  <>Guest{statusSuffix(member?.status)}</>
                ) : (
                  <>
                    {member?.isOrganizer ? "Organizer" : "Member"}
                    {statusSuffix(member?.status)}
                  </>
                )}
              </SheetDescription>
            </SheetHeader>

            <SheetBody>
              {member && (
                <div className="space-y-6 pb-6">
                  {/* Large Avatar — dashed ring for guests (claim-state signal) */}
                  <div className="flex justify-center">
                    <Avatar
                      className={cn(
                        "size-20 text-xl",
                        isGuest && "border-2 border-dashed border-accent",
                      )}
                      data-testid={`member-avatar-${member.id}`}
                      data-guest-ring={isGuest ? "dashed" : "solid"}
                    >
                      {member.profilePhotoUrl && (
                        <AvatarImage
                          src={getUploadUrl(member.profilePhotoUrl)}
                          alt={member.displayName}
                        />
                      )}
                      <AvatarFallback className="text-xl">
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Social handles — guests have no handles */}
                  {!isGuest &&
                    member.handles &&
                    Object.keys(member.handles).length > 0 && (
                      <div className="space-y-2">
                        {member.handles.venmo && (
                          <a
                            href={`https://venmo.com/${member.handles.venmo.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <VenmoIcon className="w-5 h-5 text-primary" />
                            @{member.handles.venmo.replace(/^@/, "")}
                          </a>
                        )}
                        {member.handles.instagram && (
                          <a
                            href={`https://instagram.com/${member.handles.instagram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <InstagramIcon className="w-5 h-5 text-primary" />
                            @{member.handles.instagram.replace(/^@/, "")}
                          </a>
                        )}
                      </div>
                    )}
                </div>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GuestNameTitle({
  member,
  tripId,
}: {
  member: MemberWithProfile;
  tripId: string;
}) {
  const updateGuest = useUpdateGuest(tripId);
  const [name, setName] = useState(member.displayName);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync if the member row changes underneath us (claim,
  // refetch) while the sheet is open.
  useEffect(() => {
    if (!editing) setName(member.displayName);
  }, [member.displayName, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleBlur = async () => {
    const trimmed = name.trim();
    setEditing(false);
    if (!trimmed || trimmed === member.displayName) {
      setName(member.displayName);
      setError(null);
      return;
    }
    setError(null);
    try {
      await updateGuest.mutateAsync({
        memberId: member.id,
        data: { displayName: trimmed },
      });
      toast.success("Guest updated");
    } catch (err) {
      setError(
        getUpdateGuestErrorMessage(err as Error) ?? "Failed to update guest",
      );
      setName(member.displayName);
    }
  };

  const handleKeyDown = (e: {
    key: string;
    preventDefault: () => void;
  }) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setName(member.displayName);
      setError(null);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex w-full flex-col items-start gap-1">
        <SheetTitle className="sr-only">{member.displayName}</SheetTitle>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit guest name"
          className="group flex items-center gap-1.5 rounded-sm text-left font-playfair text-3xl font-semibold tracking-tight md:text-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {member.displayName}
          <Pencil
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </button>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-1">
      <SheetTitle className="sr-only">{member.displayName}</SheetTitle>
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label="Guest name"
        className="h-auto w-full border-transparent bg-transparent p-0 text-left font-playfair text-3xl font-semibold tracking-tight shadow-none md:text-3xl focus-visible:border-transparent focus-visible:underline focus-visible:ring-0"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
