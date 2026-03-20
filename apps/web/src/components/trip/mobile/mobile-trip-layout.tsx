"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MembersList } from "@/components/trip/members-list";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { TripThemeProvider } from "@/components/trip/trip-theme-provider";
import { IconStrip } from "./icon-strip";
import { AnimatedHero } from "./animated-hero";
import {
  MobileTripSwiper,
  type MobileTripSwiperRef,
} from "./mobile-trip-swiper";
import { InfoPanel } from "./panels/info-panel";
import { ItineraryPanel } from "./panels/itinerary-panel";
import { MessagesPanel } from "./panels/messages-panel";
import { PhotosPanel } from "./panels/photos-panel";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import type { MemberWithProfile } from "@/hooks/use-invitations";
import { getRemoveMemberErrorMessage } from "@/hooks/use-invitations";
import type { TripWeatherResponse, TemperatureUnit } from "@journiful/shared/types";

const EditTripDialog = dynamic(() =>
  import("@/components/trip/edit-trip-dialog").then((mod) => ({
    default: mod.EditTripDialog,
  })),
);

const CustomizeThemeSheet = dynamic(() =>
  import("@/components/trip/customize-theme-sheet").then((mod) => ({
    default: mod.CustomizeThemeSheet,
  })),
);

const InviteMembersDialog = dynamic(() =>
  import("@/components/trip/invite-members-dialog").then((mod) => ({
    default: mod.InviteMembersDialog,
  })),
);

const MemberOnboardingWizard = dynamic(() =>
  import("@/components/trip/member-onboarding-wizard").then((mod) => ({
    default: mod.MemberOnboardingWizard,
  })),
);

interface MobileTripLayoutProps {
  trip: TripDetailWithMeta;
  tripId: string;
  isOrganizer: boolean;
  isLocked: boolean;
  activeEventCount: number;
  weather: TripWeatherResponse | undefined;
  weatherLoading: boolean;
  temperatureUnit: TemperatureUnit;
  currentMember: { id: string; userId: string; isMuted: boolean | undefined } | undefined;
  user: { id: string } | null;
  removeMember: {
    mutate: (id: string, options: { onSuccess: () => void; onError: (error: unknown) => void }) => void;
    isPending: boolean;
  };
  handleUpdateRole: (member: MemberWithProfile, isOrganizer: boolean) => void;
  initialShowOnboarding?: boolean;
}

export function MobileTripLayout({
  trip,
  tripId,
  isOrganizer,
  isLocked,
  activeEventCount,
  weather,
  weatherLoading,
  temperatureUnit,
  currentMember,
  user,
  removeMember,
  handleUpdateRole,
  initialShowOnboarding,
}: MobileTripLayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(initialShowOnboarding ?? false);
  const [removingMember, setRemovingMember] = useState<{
    member: MemberWithProfile;
  } | null>(null);

  const swiperRef = useRef<MobileTripSwiperRef>(null);

  // Hero collapse: 0 on Info panel, 1 on all other panels
  // CSS transition handles the smooth animation
  const collapseT = activeIndex === 0 ? 0 : 1;

  // Scroll itinerary to today's date when switching to itinerary panel
  useEffect(() => {
    if (activeIndex !== 1) return;
    // Small delay to let swiper transition finish
    const timer = setTimeout(() => {
      const todayEl = document.getElementById("day-today");
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  const handleIconClick = useCallback((index: number) => {
    swiperRef.current?.slideTo(index);
  }, []);

  const handleNavigateToItinerary = useCallback(() => {
    swiperRef.current?.slideTo(1);
  }, []);

  return (
    <TripThemeProvider
      themeId={trip.themeId}
      themeFont={trip.themeFont}
      scope="page"
    >
      <div className="h-[calc(100dvh-3.5rem)] flex flex-col bg-background overflow-hidden">
        <IconStrip activeIndex={activeIndex} onIconClick={handleIconClick} />

        <AnimatedHero
          trip={trip}
          collapseProgress={collapseT}
          isOrganizer={isOrganizer}
          onCustomize={() => setIsCustomizeOpen(true)}
        />

        <div className="flex-1 min-h-0">
          <MobileTripSwiper
            ref={swiperRef}
            onSlideChange={setActiveIndex}
            onProgress={() => {}}
          >
            <InfoPanel
              trip={trip}
              tripId={tripId}
              isOrganizer={isOrganizer}
              activeEventCount={activeEventCount}
              weather={weather}
              weatherLoading={weatherLoading}
              temperatureUnit={temperatureUnit}
              currentMember={currentMember}
              onOpenInvite={() => setIsInviteOpen(true)}
              onOpenEdit={() => setIsEditOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenMembers={() => setIsMembersOpen(true)}
              onNavigateToItinerary={handleNavigateToItinerary}
            />
            <ItineraryPanel
              tripId={tripId}
              onAddTravel={() => setShowOnboarding(true)}
              {...(weather?.forecasts ? { forecasts: weather.forecasts } : {})}
              temperatureUnit={temperatureUnit}
              hideFab={activeIndex !== 1}
            />
            <MessagesPanel
              tripId={tripId}
              isOrganizer={isOrganizer}
              disabled={isLocked}
              {...(currentMember?.isMuted != null ? { isMuted: currentMember.isMuted } : {})}
            />
            <PhotosPanel
              tripId={tripId}
              isOrganizer={isOrganizer}
              disabled={isLocked}
            />
          </MobileTripSwiper>
        </div>

        {/* Modals/Sheets — same as desktop, portaled */}
        {isOrganizer && trip && (
          <CustomizeThemeSheet
            trip={trip}
            open={isCustomizeOpen}
            onOpenChange={setIsCustomizeOpen}
          />
        )}

        {isOrganizer && trip && (
          <EditTripDialog
            trip={trip}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            onSuccess={() => {
              toast.success("Trip updated successfully");
            }}
          />
        )}

        {isOrganizer && (
          <InviteMembersDialog
            open={isInviteOpen}
            onOpenChange={setIsInviteOpen}
            tripId={tripId}
          />
        )}

        <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                Trip settings
              </SheetTitle>
              <SheetDescription className="sr-only">
                Manage notification preferences and privacy settings for this
                trip
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <NotificationPreferences tripId={tripId} />
            </SheetBody>
          </SheetContent>
        </Sheet>

        <Sheet
          open={isMembersOpen}
          onOpenChange={(open) => {
            setIsMembersOpen(open);
            if (!open) setRemovingMember(null);
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle className="text-3xl font-playfair tracking-tight">
                {removingMember ? "Remove member" : "Members"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {removingMember
                  ? "Confirm member removal"
                  : "Trip members and invitations"}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              {removingMember ? (
                <div className="flex flex-col flex-1">
                  <div className="flex-1">
                    <p className="text-muted-foreground">
                      Are you sure you want to remove{" "}
                      <span className="font-medium text-foreground">
                        {removingMember.member.displayName}
                      </span>{" "}
                      from this trip? This will remove their membership and any
                      associated invitation.
                    </p>
                  </div>
                  <div className="flex gap-3 justify-end mt-auto pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setRemovingMember(null)}
                      disabled={removeMember.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={removeMember.isPending}
                      onClick={() => {
                        removeMember.mutate(removingMember.member.id, {
                          onSuccess: () => {
                            toast.success(
                              `${removingMember.member.displayName} has been removed`,
                            );
                            setRemovingMember(null);
                          },
                          onError: (error: unknown) => {
                            const message = getRemoveMemberErrorMessage(error as Error | null);
                            toast.error(message ?? "Failed to remove member");
                            setRemovingMember(null);
                          },
                        });
                      }}
                    >
                      {removeMember.isPending ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              ) : (
                <MembersList
                  tripId={tripId}
                  isOrganizer={isOrganizer}
                  createdBy={trip.createdBy}
                  currentUserId={user?.id}
                  onInvite={() => {
                    setIsMembersOpen(false);
                    setIsInviteOpen(true);
                  }}
                  onRemove={(member) => setRemovingMember({ member })}
                  onUpdateRole={handleUpdateRole}
                />
              )}
            </SheetBody>
          </SheetContent>
        </Sheet>

        {showOnboarding && (
          <MemberOnboardingWizard
            open={showOnboarding}
            onOpenChange={setShowOnboarding}
            tripId={tripId}
            trip={trip}
          />
        )}
      </div>
    </TripThemeProvider>
  );
}
