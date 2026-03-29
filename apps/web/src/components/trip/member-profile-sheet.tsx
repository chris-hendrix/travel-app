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
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";

interface MemberProfileSheetProps {
  member: MemberWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
            {member?.displayName ?? ""}
          </SheetTitle>
          <SheetDescription>
            {member?.isOrganizer ? "Organizer" : "Member"}
            {member?.status === "going"
              ? " · Going"
              : member?.status === "maybe"
                ? " · Maybe"
                : member?.status === "not_going"
                  ? " · Not going"
                  : ""}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {member && (
            <div className="space-y-6 pb-6">
              {/* Large Avatar */}
              <div className="flex justify-center">
                <Avatar className="size-20 text-xl">
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

              {/* Social handles */}
              {member.handles && Object.keys(member.handles).length > 0 && (
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
