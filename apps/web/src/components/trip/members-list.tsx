"use client";

import { useState } from "react";
import {
  UserPlus,
  UserCircle,
  Phone,
  Users,
  EllipsisVertical,
  ShieldCheck,
  ShieldOff,
  UserMinus,
  VolumeX,
  Volume2,
  Loader2,
  X,
  Pencil,
  Send,
  Link2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMembers,
  useInvitations,
  useRevokeInvitation,
  getRevokeInvitationErrorMessage,
} from "@/hooks/use-invitations";
import type { MemberWithProfile } from "@/hooks/use-invitations";
import type { Invitation } from "@journiful/shared/types";
import {
  useMuteMember,
  useUnmuteMember,
  getMuteMemberErrorMessage,
  getUnmuteMemberErrorMessage,
} from "@/hooks/use-messages";
import {
  useDeletePlaceholder,
  useInvitePlaceholder,
  useLinkPlaceholder,
  getPlaceholderErrorMessage,
} from "@/hooks/use-placeholders";
import { useMutualSuggestions } from "@/hooks/use-mutuals";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";
import { AddPlaceholderDialog } from "@/components/trip/add-placeholder-dialog";
import {
  getInitials,
  formatPhoneNumber,
  formatRelativeTime,
} from "@/lib/format";
import { getUploadUrl } from "@/lib/api";

interface MembersListProps {
  tripId: string;
  isOrganizer: boolean;
  createdBy?: string;
  currentUserId?: string | undefined;
  onInvite?: () => void;
  onRemove?: (member: MemberWithProfile) => void;
  onUpdateRole?: (member: MemberWithProfile, isOrganizer: boolean) => void;
  onMemberClick?: (member: MemberWithProfile) => void;
}

function MembersListSkeleton() {
  return (
    <div className="space-y-4" data-testid="members-list-skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface MemberRowProps {
  member: MemberWithProfile;
  index?: number;
  isOrganizer: boolean;
  createdBy?: string | undefined;
  currentUserId?: string | undefined;
  onRemove?: ((member: MemberWithProfile) => void) | undefined;
  onUpdateRole?:
    | ((member: MemberWithProfile, isOrganizer: boolean) => void)
    | undefined;
  onMemberClick?: ((member: MemberWithProfile) => void) | undefined;
  onMute: (member: MemberWithProfile) => void;
  onUnmute: (member: MemberWithProfile) => void;
  // Placeholder handlers - when member.isPlaceholder
  onEditPlaceholder?: (member: MemberWithProfile) => void;
  onSendInvite?: (member: MemberWithProfile) => void;
  onLinkPlaceholder?: (member: MemberWithProfile) => void;
  onDeletePlaceholder?: (member: MemberWithProfile) => void;
}

function MemberRow({
  member,
  index = 0,
  isOrganizer,
  createdBy,
  currentUserId,
  onRemove,
  onUpdateRole,
  onMemberClick,
  onMute,
  onUnmute,
  onEditPlaceholder,
  onSendInvite,
  onLinkPlaceholder,
  onDeletePlaceholder,
}: MemberRowProps) {
  const canRemove = isOrganizer && !!onRemove && (member.isPlaceholder || member.userId !== createdBy);

  const canUpdateRole =
    !!onUpdateRole &&
    !member.isPlaceholder &&
    member.userId !== createdBy &&
    member.userId !== currentUserId;

  const canMute =
    isOrganizer && !member.isOrganizer && !member.isPlaceholder && member.userId !== createdBy;

  // For placeholders, we show a dedicated menu
  const isPlaceholder = member.isPlaceholder;
  const showPlaceholderActions = isOrganizer && isPlaceholder;
  const showRealActions = isOrganizer && (canRemove || canUpdateRole || canMute) && !isPlaceholder;
  const showActions = showPlaceholderActions || showRealActions;

  return (
    <div
      className="flex items-center gap-3 py-3 motion-safe:animate-[slideUp_400ms_ease-out_both]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button
        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-muted/50 -ml-2 pl-2 -my-1 py-1 rounded-md transition-colors"
        onClick={() => onMemberClick?.(member)}
      >
        <Avatar size="default">
          <AvatarImage
            src={getUploadUrl(member.profilePhotoUrl)}
            alt={member.displayName}
          />
          <AvatarFallback>{getInitials(member.displayName)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {member.displayName}
            </span>
          {member.isOrganizer && (
            <Badge className="bg-gradient-to-r from-primary to-accent text-white">
              Organizer
            </Badge>
          )}
          {member.isPlaceholder && (
            <span
              className="inline-flex items-center justify-center size-5 rounded-full border border-dashed border-primary/30 bg-card"
              aria-label="Placeholder"
            >
              <UserCircle className="size-3 text-primary/60" />
            </span>
          )}
          {member.isMuted && (
            <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30">
              <VolumeX className="w-3 h-3 mr-1" />
              Muted
            </Badge>
          )}
          {member.handles?.venmo && (
            <a
              href={`https://venmo.com/${member.handles.venmo.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary"
              data-testid={`member-venmo-${member.userId}`}
            >
              <VenmoIcon className="w-4 h-4" />
            </a>
          )}
          {member.handles?.instagram && (
            <a
              href={`https://instagram.com/${member.handles.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary"
              data-testid={`member-instagram-${member.userId}`}
            >
              <InstagramIcon className="w-4 h-4" />
            </a>
          )}
        </div>
        {member.phoneNumber && (
          <div className="flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {formatPhoneNumber(member.phoneNumber)}
            </span>
          </div>
        )}
        </div>
      </button>

      {showActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`Actions for ${member.displayName}`}
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isPlaceholder ? (
              <>
                <DropdownMenuItem onSelect={() => onEditPlaceholder?.(member)}>
                  <Pencil className="w-4 h-4" />
                  Edit name/phone
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSendInvite?.(member)}>
                  <Send className="w-4 h-4" />
                  Send invite
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onLinkPlaceholder?.(member)}>
                  <Link2 className="w-4 h-4" />
                  Link user
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDeletePlaceholder?.(member)}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </DropdownMenuItem>
              </>
            ) : (
              <>
                {canUpdateRole && !member.isOrganizer && (
                  <DropdownMenuItem onSelect={() => onUpdateRole!(member, true)}>
                    <ShieldCheck className="w-4 h-4" />
                    Make co-organizer
                  </DropdownMenuItem>
                )}
                {canUpdateRole && member.isOrganizer && (
                  <DropdownMenuItem onSelect={() => onUpdateRole!(member, false)}>
                    <ShieldOff className="w-4 h-4" />
                    Remove co-organizer
                  </DropdownMenuItem>
                )}
                {canMute && canUpdateRole && <DropdownMenuSeparator />}
                {canMute && (
                  <>
                    {member.isMuted ? (
                      <DropdownMenuItem onSelect={() => onUnmute(member)}>
                        <Volume2 className="w-4 h-4" />
                        Unmute
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => onMute(member)}>
                        <VolumeX className="w-4 h-4" />
                        Mute
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {canRemove && (canUpdateRole || canMute) && (
                  <DropdownMenuSeparator />
                )}
                {canRemove && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onRemove!(member)}
                  >
                    <UserMinus className="w-4 h-4" />
                    Remove from trip
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface PendingInvitationRowProps {
  invitation: Invitation;
  onRevoke: (invitationId: string) => void;
  isRevoking: boolean;
}

function PendingInvitationRow({
  invitation,
  onRevoke,
  isRevoking,
}: PendingInvitationRowProps) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar size="default">
        <AvatarFallback>
          <Phone className="w-4 h-4" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {formatPhoneNumber(invitation.inviteePhone)}
          </span>
          <Badge
            variant={
              invitation.status === "failed" ? "destructive" : "secondary"
            }
          >
            {invitation.status === "failed" ? "Failed" : "Pending"}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Sent {formatRelativeTime(invitation.sentAt)}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onRevoke(invitation.id)}
        disabled={isRevoking}
        aria-label={`Revoke invitation to ${invitation.inviteePhone}`}
      >
        <X />
      </Button>
    </div>
  );
}

export function MembersList({
  tripId,
  isOrganizer,
  createdBy,
  currentUserId,
  onInvite,
  onRemove,
  onUpdateRole,
  onMemberClick,
}: MembersListProps) {
  const { data: members, isPending } = useMembers(tripId);
  const { data: invitations } = useInvitations(tripId, {
    enabled: isOrganizer,
  });
  const [mutingMember, setMutingMember] = useState<MemberWithProfile | null>(
    null,
  );
  const muteMember = useMuteMember(tripId);
  const unmuteMember = useUnmuteMember(tripId);
  const revokeInvitation = useRevokeInvitation(tripId);

  // Placeholder dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingPlaceholder, setEditingPlaceholder] = useState<MemberWithProfile | null>(null);

  // Link sheet state
  const [linkMember, setLinkMember] = useState<MemberWithProfile | null>(null);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);

  const deletePlaceholder = useDeletePlaceholder(tripId);
  const invitePlaceholder = useInvitePlaceholder(tripId);
  const linkPlaceholder = useLinkPlaceholder(tripId);
  const { data: mutualSuggestions } = useMutualSuggestions(tripId);

  const handleMute = async () => {
    if (!mutingMember || !mutingMember.userId) return;
    try {
      await muteMember.mutateAsync(mutingMember.userId);
      toast.success(`${mutingMember.displayName} has been muted`);
    } catch (error) {
      const msg = getMuteMemberErrorMessage(error as Error);
      toast.error(msg ?? "Failed to mute member");
    } finally {
      setMutingMember(null);
    }
  };

  const handleUnmute = async (member: MemberWithProfile) => {
    if (!member.userId) return;
    try {
      await unmuteMember.mutateAsync(member.userId);
      toast.success(`${member.displayName} has been unmuted`);
    } catch (error) {
      const msg = getUnmuteMemberErrorMessage(error as Error);
      toast.error(msg ?? "Failed to unmute member");
    }
  };

  const handleRevoke = async (invitationId: string) => {
    try {
      await revokeInvitation.mutateAsync(invitationId);
      toast.success("Invitation revoked");
    } catch (error) {
      const msg = getRevokeInvitationErrorMessage(error as Error);
      toast.error(msg ?? "Failed to revoke invitation");
    }
  };

  const handleEditPlaceholder = (member: MemberWithProfile) => {
    setEditingPlaceholder(member);
    setAddDialogOpen(true);
  };

  const handleAddPerson = () => {
    setEditingPlaceholder(null);
    setAddDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) setEditingPlaceholder(null);
  };

  const handleSendInvite = async (member: MemberWithProfile) => {
    if (!member.phoneNumber) {
      toast.error("Add a phone number first");
      setEditingPlaceholder(member);
      setAddDialogOpen(true);
      return;
    }
    try {
      await invitePlaceholder.mutateAsync(member.id);
    } catch (error) {
      const msg = getPlaceholderErrorMessage(error as Error);
      toast.error(msg ?? "Failed to send invite");
    }
  };

  const handleDeletePlaceholder = async (member: MemberWithProfile) => {
    try {
      await deletePlaceholder.mutateAsync(member.id);
    } catch (error) {
      const msg = getPlaceholderErrorMessage(error as Error);
      toast.error(msg ?? "Failed to remove person");
    }
  };

  const handleLinkPlaceholder = (member: MemberWithProfile) => {
    setLinkMember(member);
    setLinkSheetOpen(true);
  };

  const handleLinkSelect = async (targetUserId: string) => {
    if (!linkMember) return;
    try {
      await linkPlaceholder.mutateAsync({
        memberId: linkMember.id,
        targetUserId,
      });
      setLinkSheetOpen(false);
      setLinkMember(null);
    } catch (error) {
      const msg = getPlaceholderErrorMessage(error as Error);
      toast.error(msg ?? "Failed to link user");
    }
  };

  if (isPending) {
    return <MembersListSkeleton />;
  }

  if (!members || members.length === 0) {
    return (
      <div className="flex flex-col flex-1">
        <EmptyState
          icon={Users}
          title="No members yet"
          variant="inline"
          className="flex-1"
        />
        {isOrganizer && onInvite && (
          <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-4 flex flex-col">
            <Button
              onClick={onInvite}
              variant="gradient"
              size="lg"
              className="w-full h-12"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite members
            </Button>
            <button
              onClick={handleAddPerson}
              disabled={(members?.length ?? 0) >= 25}
              data-testid="add-placeholder-trigger"
              className="w-full text-center text-xs font-normal text-muted-foreground hover:text-foreground mt-3 py-1 disabled:opacity-50 disabled:pointer-events-none"
              type="button"
            >
              Add person without inviting
            </button>
          </div>
        )}
        <AddPlaceholderDialog
          open={addDialogOpen}
          onOpenChange={handleDialogOpenChange}
          tripId={tripId}
          placeholder={editingPlaceholder}
        />
      </div>
    );
  }

  // Group members by RSVP status
  const going = members.filter((m) => m.status === "going");
  const maybe = members.filter((m) => m.status === "maybe");
  const notGoing = members.filter((m) => m.status === "not_going");
  const placeholders = members.filter((m) => m.isPlaceholder);

  // Pending/failed invitations + no_response members for the Invited group (legacy tab combined both)
  const pendingInvitations =
    invitations?.filter(
      (inv) => inv.status === "pending" || inv.status === "failed",
    ) ?? [];
  const noResponseMembers = members.filter((m) => m.status === "no_response" && !m.isPlaceholder);
  const invitedCount = noResponseMembers.length + pendingInvitations.length;

  // Partition rule: Not invited = isPlaceholder && !hasPendingInvite(memberId or phone)
  const pendingInvitePhoneSet = new Set(pendingInvitations.map((i) => i.inviteePhone));
  const pendingInviteMemberIdSet = new Set(
    pendingInvitations.map((i) => (i as unknown as { memberId?: string }).memberId).filter(Boolean) as string[],
  );

  function hasPendingInvite(member: MemberWithProfile): boolean {
    if (pendingInviteMemberIdSet.has(member.id)) return true;
    if (member.phoneNumber && pendingInvitePhoneSet.has(member.phoneNumber)) return true;
    return false;
  }

  const notInvited = placeholders.filter((m) => !hasPendingInvite(m));

  const memberRowProps = {
    isOrganizer,
    createdBy,
    currentUserId,
    onRemove,
    onUpdateRole,
    onMemberClick,
    onMute: setMutingMember,
    onUnmute: handleUnmute,
    onEditPlaceholder: handleEditPlaceholder,
    onSendInvite: handleSendInvite,
    onLinkPlaceholder: handleLinkPlaceholder,
    onDeletePlaceholder: handleDeletePlaceholder,
  };

  function SectionHeader({ title, count }: { title: string; count: number }) {
    return (
      <div className="flex items-center justify-between py-2">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{title}</h3>
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{count}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 space-y-6 overflow-y-auto">
        {going.length > 0 && (
          <section>
            <SectionHeader title="Going" count={going.length} />
            <div className="divide-y divide-border">
              {going.map((member, i) => (
                <MemberRow key={member.id} member={member} index={i} {...memberRowProps} />
              ))}
            </div>
          </section>
        )}
        {maybe.length > 0 && (
          <section>
            <SectionHeader title="Maybe" count={maybe.length} />
            <div className="divide-y divide-border">
              {maybe.map((member, i) => (
                <MemberRow key={member.id} member={member} index={i} {...memberRowProps} />
              ))}
            </div>
          </section>
        )}
        {isOrganizer && notGoing.length > 0 && (
          <section>
            <SectionHeader title="Not going" count={notGoing.length} />
            <div className="divide-y divide-border">
              {notGoing.map((member, i) => (
                <MemberRow key={member.id} member={member} index={i} {...memberRowProps} />
              ))}
            </div>
          </section>
        )}
        {isOrganizer && invitedCount > 0 && (
          <section>
            <SectionHeader title="Invited" count={invitedCount} />
            <div className="divide-y divide-border">
              {noResponseMembers.map((member, i) => (
                <MemberRow key={member.id} member={member} index={i} {...memberRowProps} />
              ))}
              {pendingInvitations.map((invitation) => (
                <PendingInvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  onRevoke={handleRevoke}
                  isRevoking={revokeInvitation.isPending}
                />
              ))}
            </div>
          </section>
        )}
        {isOrganizer && notInvited.length > 0 && (
          <section>
            <SectionHeader title="Placeholders" count={notInvited.length} />
            <div className="divide-y divide-border">
              {notInvited.map((member, i) => (
                <MemberRow key={member.id} member={member} index={i} {...memberRowProps} />
              ))}
            </div>
          </section>
        )}
      </div>

      {isOrganizer && onInvite && (
        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-4 flex flex-col">
          <Button
            onClick={onInvite}
            variant="gradient"
            size="lg"
            className="w-full h-12"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite members
          </Button>
          <button
            onClick={handleAddPerson}
            disabled={(members?.length ?? 0) >= 25}
            data-testid="add-placeholder-trigger"
            className="w-full text-center text-xs font-normal text-muted-foreground hover:text-foreground mt-3 py-1 disabled:opacity-50 disabled:pointer-events-none"
            type="button"
          >
            Add person without inviting
          </button>
        </div>
      )}

      <AddPlaceholderDialog
        open={addDialogOpen}
        onOpenChange={handleDialogOpenChange}
        tripId={tripId}
        placeholder={editingPlaceholder}
      />

      {/* Link user sheet */}
      <Sheet open={linkSheetOpen} onOpenChange={setLinkSheetOpen}>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle className="font-playfair">Link to mutual</SheetTitle>
            <SheetDescription>
              Pick a mutual to connect to “{linkMember?.displayName}”. If they already have a member row, their travel and payments will be merged.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3">
            {!mutualSuggestions || mutualSuggestions.mutuals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No mutuals available</p>
            ) : (
              <div className="space-y-1 max-h-[60dvh] overflow-y-auto">
                {mutualSuggestions.mutuals.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleLinkSelect(m.id)}
                    disabled={linkPlaceholder.isPending}
                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/60 text-left"
                  >
                    <Avatar size="sm">
                      <AvatarImage src={getUploadUrl(m.profilePhotoUrl)} alt={m.displayName} />
                      <AvatarFallback>{getInitials(m.displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate flex-1">{m.displayName}</span>
                    {linkPlaceholder.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  </button>
                ))}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!mutingMember}
        onOpenChange={(open) => !open && setMutingMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mute {mutingMember?.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This member will not be able to post messages in the trip
              discussion. You can unmute them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={muteMember.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleMute}
              disabled={muteMember.isPending}
            >
              {muteMember.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Mute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
