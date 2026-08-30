"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MembersList } from "@/components/trip/members-list";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { TripThemeProvider } from "@/components/trip/trip-theme-provider";
import { useHasOpenDialog } from "@/hooks/use-has-open-dialog";
import { IconStrip } from "./icon-strip";
import { AnimatedHero } from "./animated-hero";
import {
  MobileTripSwiper,
  type MobileTripSwiperRef,
} from "./mobile-trip-swiper";
import { InfoPanel } from "./panels/info-panel";
import { DiscoverPanel } from "./panels/discover-panel";
import { ItineraryPanel } from "./panels/itinerary-panel";
import { MessagesPanel } from "./panels/messages-panel";
import { PhotosPanel } from "./panels/photos-panel";
import { SettleSection } from "@/components/settle/settle-section";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import type { MemberWithProfile } from "@/hooks/use-invitations";
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
  handleUpdateRole,
  initialShowOnboarding,
}: MobileTripLayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const hasOpenDialog = useHasOpenDialog();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(initialShowOnboarding ?? false);

  const swiperRef = useRef<MobileTripSwiperRef>(null);

  // Hero collapse: scroll-driven on Info panel, fully collapsed on other panels.
  // `isScrollDriving` disables CSS transitions so scroll feels instant; it is
  // only true while the user is actively scrolling the info panel, never during
  // a slide transition (so the hero animates smoothly between panels).
  const [infoScrollCollapse, setInfoScrollCollapse] = useState(0);
  const [isScrollDriving, setIsScrollDriving] = useState(false);
  const scrollDrivingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInfoScroll = useCallback((scrollTop: number) => {
    setInfoScrollCollapse(Math.min(1, scrollTop / 120));
    setIsScrollDriving(true);
    if (scrollDrivingTimer.current) clearTimeout(scrollDrivingTimer.current);
    scrollDrivingTimer.current = setTimeout(() => setIsScrollDriving(false), 150);
  }, []);

  const collapseT = activeIndex === 0 ? infoScrollCollapse : 1;

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

  return (
    <TripThemeProvider
      themeId={trip.themeId}
      themeFont={trip.themeFont}
      scope="page"
    >
      <div className="h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] flex flex-col bg-background overflow-hidden">
        <AnimatedHero
          trip={trip}
          collapseProgress={collapseT}
          disableTransition={isScrollDriving}
          isOrganizer={isOrganizer}
          onCustomize={() => setIsCustomizeOpen(true)}
        />

        <div className="flex-1 min-h-0">
          <MobileTripSwiper
            ref={swiperRef}
            onSlideChange={setActiveIndex}
            onProgress={() => {}}
            allowTouchMove={!hasOpenDialog}
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
              onScroll={handleInfoScroll}
            />
            <ItineraryPanel
              tripId={tripId}
              onAddTravel={() => setShowOnboarding(true)}
              {...(weather?.forecasts ? { forecasts: weather.forecasts } : {})}
              temperatureUnit={temperatureUnit}
              hideFab={activeIndex !== 1}
            />
            <DiscoverPanel
              tripId={tripId}
              temperatureUnit={temperatureUnit}
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
              hideFab={activeIndex !== 4}
            />
            <SettleSection
              tripId={tripId}
              isOrganizer={isOrganizer}
              disabled={isLocked}
              variant="panel"
              hideFab={activeIndex !== 5}
            />
          </MobileTripSwiper>
        </div>

        <IconStrip activeIndex={activeIndex} onIconClick={handleIconClick} />

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

        {/* Members Sheet — same sheet, different views (list / profile / placeholder detail) */}
        <Sheet open={isMembersOpen} onOpenChange={setIsMembersOpen}>
          <SheetContent className="p-0 gap-0 flex flex-col">
            <MembersList
              tripId={tripId}
              isOrganizer={isOrganizer}
              createdBy={trip.createdBy}
              currentUserId={user?.id}
              onInvite={() => {
                setIsMembersOpen(false);
                setIsInviteOpen(true);
              }}
              onUpdateRole={handleUpdateRole}
            />
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
