"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LogOut, Menu, Users } from "lucide-react";
import { useAuth } from "@/app/providers/auth-provider";
import { getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { supportsHover } from "@/lib/supports-hover";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications";
import { MobileNav } from "@/components/mobile-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background border-b border-border linen-texture">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            {/* Mobile hamburger button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="mobile-menu-button"
            >
              <Menu className="size-5" />
            </Button>

            <Link
              href="/trips"
              className="font-display text-xl font-bold tracking-tight"
            >
              Tripful
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            {/* Desktop dropdown menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex rounded-full"
                  aria-label="User menu"
                  onMouseEnter={
                    supportsHover ? preloadProfileDialog : undefined
                  }
                  onTouchStart={preloadProfileDialog}
                  onFocus={preloadProfileDialog}
                >
                  <UserAvatar user={user} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {user && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => setProfileDialogOpen(true)}
                      onMouseEnter={
                        supportsHover ? preloadProfileDialog : undefined
                      }
                      onTouchStart={preloadProfileDialog}
                      onFocus={preloadProfileDialog}
                      className="flex flex-col items-start gap-0 font-accent"
                      data-testid="profile-menu-item"
                    >
                      <p className="text-sm font-medium">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.phoneNumber}
                      </p>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild data-testid="mutuals-menu-item">
                      <Link href="/mutuals" className="font-accent">
                        <Users />
                        My Mutuals
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={logout} className="font-accent">
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile navigation sheet */}
      <MobileNav
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        user={user}
        onLogout={logout}
        onProfileOpen={() => setProfileDialogOpen(true)}
      />

      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      />
    </>
  );
}
