"use client";

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
import { isGuestMember } from "@/components/trip/guest-avatar";
import { GuestEditor } from "@/components/trip/guest-editor";
import { GuestNameTitle } from "@/components/trip/guest-name-title";
import { cn } from "@/lib/utils";
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";

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

