"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { MemberWithProfile } from "@journiful/shared/types";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const RSVP_OPTIONS: { value: MemberWithProfile["status"]; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "no_response", label: "No response" },
  { value: "not_going", label: "Not going" },
];

function GuestActions({
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
  const guestPhone = member.guestPhone ?? member.phoneNumber ?? null;

  const { data: invitations } = useInvitations(tripId, { enabled: true });
  const inviteMembers = useInviteMembers(tripId);
  const removeMember = useRemoveMember(tripId);
  const updateGuest = useUpdateGuest(tripId);
  const { data: suggestions } = useMutualSuggestions(tripId);

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachSearch, setAttachSearch] = useState("");
  const [selectedMutualId, setSelectedMutualId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(member.displayName);
  const [editPhone, setEditPhone] = useState(guestPhone ?? "");
  const [editStatus, setEditStatus] = useState<MemberWithProfile["status"]>(
    member.status,
  );
  const [removeOpen, setRemoveOpen] = useState(false);

  const pendingInviteExists =
    !!guestPhone &&
    (invitations ?? []).some(
      (inv) => inv.inviteePhone === guestPhone && inv.status === "pending",
    );

  const mutuals =
    suggestions && "mutuals" in suggestions ? suggestions.mutuals : [];
  const filteredMutuals = mutuals.filter((m) =>
    m.displayName.toLowerCase().includes(attachSearch.toLowerCase()),
  );
  const selectedMutual = mutuals.find((m) => m.id === selectedMutualId) ?? null;

  const handleSendInvite = async () => {
    if (!guestPhone) return;
    try {
      await inviteMembers.mutateAsync({ phoneNumbers: [guestPhone], userIds: [] });
      toast.success(`Invite sent to ${guestPhone}`);
    } catch (error) {
      toast.error(
        getInviteMembersErrorMessage(error as Error) ?? "Failed to send invite",
      );
    }
  };

  const handleAttach = async () => {
    if (!selectedMutual) return;
    try {
      await inviteMembers.mutateAsync({ phoneNumbers: [], userIds: [selectedMutual.id] });
      toast.success(`${member.displayName} is now ${selectedMutual.displayName}`);
      setAttachOpen(false);
      setSelectedMutualId(null);
      onClaimed();
    } catch (error) {
      toast.error(
        getInviteMembersErrorMessage(error as Error) ?? "Failed to attach member",
      );
    }
  };

  const handleSaveEdit = async () => {
    try {
      await updateGuest.mutateAsync({
        memberId: member.id,
        data: {
          ...(editName.trim() ? { displayName: editName.trim() } : {}),
          guestPhone: editPhone.trim() ? editPhone.trim() : null,
          status: editStatus,
        },
      });
      toast.success("Guest updated");
      setEditOpen(false);
    } catch (error) {
      toast.error(
        getUpdateGuestErrorMessage(error as Error) ?? "Failed to update guest",
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {guestPhone && (
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={pendingInviteExists || inviteMembers.isPending}
            onClick={handleSendInvite}
          >
            <span aria-hidden>📱</span>
            {pendingInviteExists ? "Invite sent" : "Send invite"}
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full justify-start"
          aria-expanded={attachOpen}
          onClick={() => setAttachOpen((v) => !v)}
        >
          <span aria-hidden>👥</span>
          Attach to a mutual {attachOpen ? "▴" : "▾"}
        </Button>
        {attachOpen && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Input
              placeholder="Search mutuals…"
              value={attachSearch}
              onChange={(e) => setAttachSearch(e.target.value)}
              aria-label="Search mutuals"
            />
            {filteredMutuals.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                None of your mutuals match yet — try Send invite instead.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredMutuals.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name={`attach-mutual-${member.id}`}
                      checked={selectedMutualId === m.id}
                      onChange={() => setSelectedMutualId(m.id)}
                      aria-label={m.displayName}
                    />
                    <span className="font-medium">{m.displayName}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedMutual && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  Attach {member.displayName} to {selectedMutual.displayName}?{" "}
                  {selectedMutual.displayName} gets a trip invite.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={inviteMembers.isPending}
                    onClick={handleAttach}
                  >
                    Attach to {selectedMutual.displayName}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedMutualId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-medium text-foreground hover:underline"
          aria-expanded={editOpen}
          onClick={() => {
            setEditOpen((v) => !v);
            setEditName(member.displayName);
            setEditPhone(guestPhone ?? "");
            setEditStatus(member.status);
          }}
        >
          Edit guest <span aria-hidden>{editOpen ? "▴" : "→"}</span>
        </button>
        {editOpen && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor={`guest-name-${member.id}`}>Name</Label>
              <Input
                id={`guest-name-${member.id}`}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`guest-phone-${member.id}`}>Phone</Label>
              <Input
                id={`guest-phone-${member.id}`}
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">RSVP</legend>
              <div className="flex flex-wrap gap-3">
                {RSVP_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name={`guest-rsvp-${member.id}`}
                      checked={editStatus === opt.value}
                      onChange={() => setEditStatus(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              size="sm"
              disabled={updateGuest.isPending || !editName.trim()}
              onClick={handleSaveEdit}
            >
              Save changes
            </Button>
          </div>
        )}
        <button
          type="button"
          className="flex w-full items-center text-sm font-medium text-destructive hover:underline"
          onClick={() => setRemoveOpen(true)}
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
  const showGuestActions = isGuest && isOrganizer && !!tripId && !!member;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            {member?.displayName ?? ""}{" "}
            {isGuest && (
              <Badge className="bg-accent text-accent-foreground align-middle">
                Guest
              </Badge>
            )}
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

              {showGuestActions && (
                <GuestActions
                  member={member}
                  tripId={tripId as string}
                  onClaimed={() => onOpenChange(false)}
                  {...(onRemove ? { onRemove } : {})}
                />
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
