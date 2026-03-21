"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LogOut, Users } from "lucide-react";
import { useAuth } from "@/app/providers/auth-provider";
import { getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { supportsHover } from "@/lib/supports-hover";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications";
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

const ProfileDialog = dynamic(() =>
  import("@/components/profile/profile-dialog").then((mod) => ({
    default: mod.ProfileDialog,
  })),
);

const preloadProfileDialog = () =>
  void import("@/components/profile/profile-dialog");

function UserAvatar({
  user,
  size = "sm",
}: {
  user: { displayName: string; profilePhotoUrl?: string | null } | null;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      {user?.profilePhotoUrl && (
        <AvatarImage
          src={getUploadUrl(user.profilePhotoUrl)}
          alt={user.displayName}
        />
      )}
      <AvatarFallback>
        {user ? getInitials(user.displayName) : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background border-b border-border linen-texture">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/trips"
            className="font-display text-xl font-bold tracking-tight"
          >
            Journiful
          </Link>

          <div className="flex items-center gap-2">
            <NotificationBell />

            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="User menu"
              onClick={() => setMenuOpen(true)}
              onMouseEnter={
                supportsHover ? preloadProfileDialog : undefined
              }
              onTouchStart={preloadProfileDialog}
              onFocus={preloadProfileDialog}
            >
              <UserAvatar user={user} />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" showCloseButton={true}>
          <SheetHeader>
            <SheetTitle className="sr-only">User menu</SheetTitle>
            <SheetDescription className="sr-only">
              Account and navigation options
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            {user && (
              <div className="flex items-center gap-3 mb-4">
                <UserAvatar user={user} size="default" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.phoneNumber}
                  </p>
                </div>
              </div>
            )}

            <Separator />

            <nav className="flex flex-col gap-1 py-4">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setProfileDialogOpen(true);
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                data-testid="profile-menu-item"
              >
                <UserAvatar user={user} size="sm" />
                Profile
              </button>
              <Link
                href="/mutuals"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                data-testid="mutuals-menu-item"
              >
                <Users className="size-5" />
                My Mutuals
              </Link>
            </nav>

            <Separator />

            <div className="flex flex-col gap-1 py-4">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                data-testid="mobile-menu-logout-button"
              >
                <LogOut className="size-5" />
                Log out
              </button>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      />
    </>
  );
}
