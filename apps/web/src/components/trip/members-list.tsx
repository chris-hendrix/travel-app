"use client";

import { useState } from "react";
import {
  UserPlus,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";
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
  onMute: (member: MemberWithProfile) => void;
  onUnmute: (member: MemberWithProfile) => void;
}

function MemberRow({
  member,
  index = 0,
  isOrganizer,
  createdBy,
  currentUserId,
  onRemove,
  onUpdateRole,
  onMute,
  onUnmute,
}: MemberRowProps) {
  const canRemove = isOrganizer && !!onRemove && member.userId !== createdBy;

  const canUpdateRole =
    !!onUpdateRole &&
    member.userId !== createdBy &&
    member.userId !== currentUserId;

  const canMute =
    isOrganizer && !member.isOrganizer && member.userId !== createdBy;

  const showActions = isOrganizer && (canRemove || canUpdateRole || canMute);

  return (
    <div
      className="flex items-center gap-3 py-3 motion-safe:animate-[slideUp_400ms_ease-out_both]"
      style={{ animationDelay: `${index * 50}ms` }}
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

      {showActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`Actions for ${member.displayName}`}
            >
              <EllipsisVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
        <X className="w-4 h-4" />
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

  const handleMute = async () => {
    if (!mutingMember) return;
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
          <div className="mt-auto pt-4 border-t border-border">
            <Button
              onClick={onInvite}
              variant="outline"
              size="sm"
              className="h-10 px-4 rounded-md border-input hover:bg-secondary"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite members
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Group members by RSVP status
  const going = members.filter((m) => m.status === "going");
  const maybe = members.filter((m) => m.status === "maybe");
  const notGoing = members.filter((m) => m.status === "not_going");
  const noResponse = members.filter((m) => m.status === "no_response");

  // Pending/failed invitations for the Invited tab
  const pendingInvitations =
    invitations?.filter(
      (inv) => inv.status === "pending" || inv.status === "failed",
    ) ?? [];

  const invitedCount = noResponse.length + pendingInvitations.length;

  const memberRowProps = {
    isOrganizer,
    createdBy,
    currentUserId,
    onRemove,
    onUpdateRole,
    onMute: setMutingMember,
    onUnmute: handleUnmute,
  };

  return (
    <div className="flex flex-col flex-1">
      <Tabs defaultValue="going" className="flex-1">
        <TabsList
          variant="line"
          className="flex w-full justify-start overflow-x-auto overflow-y-hidden [&>*]:flex-none gap-1 border-b border-border px-0"
        >
          <TabsTrigger value="going" className="text-sm">
            Going
            <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {going.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="maybe" className="text-sm">
            Maybe
            <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {maybe.length}
            </span>
          </TabsTrigger>
          {isOrganizer && (
            <TabsTrigger value="not_going" className="text-sm">
              Not Going
              <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {notGoing.length}
              </span>
            </TabsTrigger>
          )}
          {isOrganizer && (
            <TabsTrigger value="invited" className="text-sm">
              Invited
              <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {invitedCount}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="going">
          <div className="divide-y divide-border">
            {going.map((member, i) => (
              <MemberRow
                key={member.id}
                member={member}
                index={i}
                {...memberRowProps}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="maybe">
          <div className="divide-y divide-border">
            {maybe.map((member, i) => (
              <MemberRow
                key={member.id}
                member={member}
                index={i}
                {...memberRowProps}
              />
            ))}
          </div>
        </TabsContent>

        {isOrganizer && (
          <TabsContent value="not_going">
            <div className="divide-y divide-border">
              {notGoing.map((member, i) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  index={i}
                  {...memberRowProps}
                />
              ))}
            </div>
          </TabsContent>
        )}

        {isOrganizer && (
          <TabsContent value="invited">
            <div className="divide-y divide-border">
              {noResponse.map((member, i) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  index={i}
                  {...memberRowProps}
                />
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
          </TabsContent>
        )}
      </Tabs>

      {isOrganizer && onInvite && (
        <div className="mt-auto pt-4 border-t border-border">
          <Button
            onClick={onInvite}
            variant="outline"
            size="sm"
            className="h-10 px-4 rounded-md border-input hover:bg-secondary"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite
          </Button>
        </div>
      )}

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
