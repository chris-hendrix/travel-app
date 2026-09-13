"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { MemberWithProfile } from "@journiful/shared/types";
import { PHONE_REGEX } from "@journiful/shared/schemas";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { RsvpPills } from "@/components/trip/rsvp-pills";
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

interface GuestEditorProps {
  member: MemberWithProfile;
  tripId: string;
  onRemove?: (member: MemberWithProfile) => void;
  onClaimed: () => void;
}

export function GuestEditor({
  member,
  tripId,
  onRemove,
  onClaimed,
}: GuestEditorProps) {
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

  const inviteSent = pendingInviteExists && !phoneEdited;

  const handleSend = async () => {
    if (inviteSent) return;
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
      // The updateGuest mutation rolls back its optimistic cache update on
      // error, but the phone draft still holds the rejected number — reset
      // it to the last server value so phoneEdited clears and the
      // Invite-sent state can re-engage. Skip the reset when the phone
      // update itself succeeded (guestUpdated): the draft already matches
      // the server and only the invite failed.
      const resyncDraft = () => setPhone(savedPhone);
      // Branch on which mutation threw: a post-update invite failure is an
      // invite error even though the APIError carries a `code` field.
      if (guestUpdated) {
        toast.error(
          getInviteMembersErrorMessage(error as Error) ??
            "Failed to send invite",
        );
      } else if (error instanceof Error && "code" in error) {
        resyncDraft();
        setPhoneError(
          getUpdateGuestErrorMessage(error as Error) ??
            "Failed to send invite",
        );
      } else {
        resyncDraft();
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

  const handlePhoneChange = (v?: string) => {
    const next = v ?? "";
    setPhone(next);
    if (phoneError && PHONE_REGEX.test(next.trim())) setPhoneError(null);
  };

  const handlePhoneBlur = () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError(null);
      return;
    }
    setPhoneError(
      PHONE_REGEX.test(trimmed) ? null : "Enter a valid phone number",
    );
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
          <Label htmlFor="guest-phone">Guest phone number</Label>
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring">
            <div
              className="flex min-w-0 flex-1 items-center gap-1 px-3"
            >
              <PhoneInput
                id="guest-phone"
                value={phone}
                onChange={handlePhoneChange}
                onBlur={handlePhoneBlur}
                placeholder="+1 555 123 4567"
                aria-label="Guest phone number"
                aria-invalid={phoneError ? true : false}
                aria-describedby={phoneError ? "guest-phone-error" : undefined}
                className="min-w-0 flex-1 [&_input]:h-9 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-1 [&_input]:shadow-none [&_input]:focus-visible:ring-0"
              />
            </div>
            <Button
              type="button"
              onClick={handleSend}
              disabled={inviteSent || !phoneValid || sendBusy}
              aria-disabled={inviteSent || undefined}
              variant="ghost"
              className="h-full shrink-0 rounded-none rounded-r-[calc(var(--radius)-1px)] border-l border-input px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              {inviteSent ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check aria-hidden className="size-4" />
                  Invite sent
                </span>
              ) : (
                "Send"
              )}
            </Button>
          </div>
          {phoneError && (
            <p id="guest-phone-error" role="alert" className="text-xs text-destructive">
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
                      <span className="flex items-center gap-2">
                        <Avatar size="sm" className="size-6 text-[10px]">
                          {m.profilePhotoUrl && (
                            <AvatarImage
                              src={getUploadUrl(m.profilePhotoUrl)}
                              alt=""
                            />
                          )}
                          <AvatarFallback>{getInitials(m.displayName)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {m.displayName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {m.sharedTripCount} shared trip
                            {m.sharedTripCount !== 1 ? "s" : ""}
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleClaim}
              disabled={!selectedMutual || inviteMembers.isPending}
              variant="ghost"
              className="h-full shrink-0 rounded-none rounded-r-[calc(var(--radius)-1px)] border-l border-input px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
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
