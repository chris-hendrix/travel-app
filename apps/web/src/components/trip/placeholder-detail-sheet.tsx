"use client";

import type { MemberWithProfile } from "@journiful/shared/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { PlaceholderDetailView } from "./placeholder-detail-view";

interface PlaceholderDetailSheetProps {
  member: MemberWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  initialFocus?: "name" | "phone" | "mutual" | undefined;
}

/**
 * Standalone placeholder detail sheet — kept for backwards-compat.
 * The members sheet now renders PlaceholderDetailView in-sheet; this wrapper
 * preserves the standalone Sheet for any other consumer.
 */
export function PlaceholderDetailSheet({
  member,
  open,
  onOpenChange,
  tripId,
  initialFocus,
}: PlaceholderDetailSheetProps) {
  if (!member || !member.isPlaceholder) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-card flex flex-col p-0 gap-0" data-testid="placeholder-detail-sheet">
        <SheetHeader className="pb-0">
          <SheetTitle className="text-3xl font-playfair tracking-tight text-left">
            {member.displayName}
          </SheetTitle>
          <SheetDescription className="sr-only">Manage placeholder {member.displayName}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex-1 overflow-y-auto">
          <PlaceholderDetailView
            member={member}
            tripId={tripId}
            initialFocus={initialFocus}
            onBack={() => onOpenChange(false)}
            onCloseSheet={() => onOpenChange(false)}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
