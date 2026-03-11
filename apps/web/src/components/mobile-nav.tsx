"use client";

import Link from "next/link";
import { Compass, LogOut, User as UserIcon, Users } from "lucide-react";
import type { User } from "@tripful/shared";
import { getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onLogout: () => void;
  onProfileOpen: () => void;
}

export function MobileNav({
  open,
  onOpenChange,
  user,
  onLogout,
  onProfileOpen,
}: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showCloseButton={true}>
        <SheetHeader>
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation and account options
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {/* User info */}
          {user && (
            <div
              className="flex items-center gap-3 mb-4"
              data-testid="mobile-menu-user-info"
            >
              <Avatar size="default">
                {user.profilePhotoUrl && (
                  <AvatarImage
                    src={getUploadUrl(user.profilePhotoUrl)}
                    alt={user.displayName}
                  />
                )}
                <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate font-accent">
                  {user.displayName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.phoneNumber}
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Navigation links */}
          <nav className="flex flex-col gap-1 py-4">
            <Link
              href="/trips"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors font-accent"
              data-testid="mobile-menu-trips-link"
            >
              <Compass className="size-5" />
              My Trips
            </Link>
            <Link
              href="/mutuals"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors font-accent"
              data-testid="mobile-menu-mutuals-link"
            >
              <Users className="size-5" />
              My Mutuals
            </Link>
          </nav>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-1 py-4">
            <button
              onClick={() => {
                onOpenChange(false);
                onProfileOpen();
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors font-accent cursor-pointer"
              data-testid="mobile-menu-profile-button"
            >
              <UserIcon className="size-5" />
              Profile
            </button>
            <button
              onClick={() => {
                onOpenChange(false);
                onLogout();
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors font-accent cursor-pointer"
              data-testid="mobile-menu-logout-button"
            >
              <LogOut className="size-5" />
              Log out
            </button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
