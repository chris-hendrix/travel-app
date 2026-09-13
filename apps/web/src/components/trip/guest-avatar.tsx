"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MemberWithProfile } from "@journiful/shared/types";

/** A member is a guest (no attached user account) when userId is null. */
export function isGuestMember(
  member: Pick<MemberWithProfile, "userId"> | null | undefined,
): boolean {
  return !!member && member.userId === null;
}

interface MemberAvatarProps {
  member: MemberWithProfile;
  size?: "default" | "sm" | "lg";
  className?: string;
}

/**
 * Shared member avatar treatment: guests (userId === null) render with a
 * dashed terracotta ring — the claim-state signal used by every surface.
 * Claimed members render the standard solid avatar/photo.
 */
export function MemberAvatar({
  member,
  size = "default",
  className,
}: MemberAvatarProps) {
  const isGuest = isGuestMember(member);
  return (
    <Avatar
      size={size}
      data-testid={`member-avatar-${member.id}`}
      data-guest-ring={isGuest ? "dashed" : "solid"}
      className={cn(
        isGuest && "border-2 border-dashed border-accent",
        className,
      )}
    >
      <AvatarImage
        src={getUploadUrl(member.profilePhotoUrl)}
        alt={member.displayName}
      />
      <AvatarFallback>{getInitials(member.displayName)}</AvatarFallback>
    </Avatar>
  );
}
