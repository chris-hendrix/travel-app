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
import { Badge } from "@/components/ui/badge";
import { isGuestMember } from "@/components/trip/guest-avatar";
import { cn } from "@/lib/utils";
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";

interface MemberProfileSheetProps {
  member: MemberWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}: MemberProfileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            {member?.displayName ?? ""}{" "}
            {member && isGuestMember(member) && (
              <Badge className="bg-accent text-accent-foreground align-middle">
                Guest
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {member && isGuestMember(member) ? (
              <>Guest{statusSuffix(member.status)}</>
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
                    isGuestMember(member) &&
                      "border-2 border-dashed border-accent",
                  )}
                  data-testid={`member-avatar-${member.id}`}
                  data-guest-ring={isGuestMember(member) ? "dashed" : "solid"}
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
              {!isGuestMember(member) &&
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
      </SheetContent>
    </Sheet>
  );
}
