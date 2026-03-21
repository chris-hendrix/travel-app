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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-transparent text-muted-foreground hover:text-foreground"
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
              <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-[380px]">
                {user && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => setProfileDialogOpen(true)}
                      onMouseEnter={
                        supportsHover ? preloadProfileDialog : undefined
                      }
                      onTouchStart={preloadProfileDialog}
                      onFocus={preloadProfileDialog}
                      className="flex flex-col items-start gap-0"
                      data-testid="profile-menu-item"
                    >
                      <p className="text-sm font-medium">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.phoneNumber}
                      </p>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild data-testid="mutuals-menu-item">
                      <Link href="/mutuals">
                        <Users />
                        My Mutuals
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={logout}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      />
    </>
  );
}
