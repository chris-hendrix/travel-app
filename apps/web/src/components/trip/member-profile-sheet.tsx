"use client";

import type { MemberWithProfile } from "@journiful/shared/types";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MemberProfileView } from "./member-profile-view";

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

        <SheetBody>{member && <MemberProfileView member={member} />}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}
