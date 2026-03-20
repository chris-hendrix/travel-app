"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  Calendar,
  MapPin,
  Users,
  ClipboardList,
  AlertCircle,
  UserPlus,
  Pencil,
  Paintbrush,
  ChevronDown,
  Settings,
} from "lucide-react";
import { useTripDetail } from "@/hooks/use-trips";
import { useEvents } from "@/hooks/use-events";
import {
  useRemoveMember,
  getRemoveMemberErrorMessage,
  useUpdateMemberRole,
  getUpdateMemberRoleErrorMessage,
} from "@/hooks/use-invitations";
import { membersQueryOptions } from "@/hooks/invitation-queries";
import { useQuery } from "@tanstack/react-query";
import type { MemberWithProfile } from "@/hooks/use-invitations";
import { useAuth } from "@/app/providers/auth-provider";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MobileTripLayout } from "@/components/trip/mobile/mobile-trip-layout";
import { Button } from "@/components/ui/button";
import { RsvpBadgeDropdown } from "@/components/trip/rsvp-badge-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { TopoPattern } from "@/components/ui/topo-pattern";
import { formatDateRange, getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { WeatherForecastCard } from "@/components/itinerary/weather-forecast-card";
import { useWeatherForecast } from "@/hooks/use-weather";
import type { TemperatureUnit } from "@journiful/shared/types";
import { TripMessages, MessageCountIndicator } from "@/components/messaging";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { ErrorBoundary } from "@/components/error-boundary";
import { MembersList } from "@/components/trip/members-list";
import { TripPreview } from "@/components/trip/trip-preview";
import { TripThemeProvider } from "@/components/trip/trip-theme-provider";
import { THEME_PRESETS } from "@journiful/shared/config";
import { THEME_FONTS } from "@journiful/shared/config";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { supportsHover } from "@/lib/supports-hover";

const EditTripDialog = dynamic(() =>
  import("@/components/trip/edit-trip-dialog").then((mod) => ({
    default: mod.EditTripDialog,
  })),
);

const preloadEditTripDialog = () =>
  void import("@/components/trip/edit-trip-dialog");

const CustomizeThemeSheet = dynamic(() =>
  import("@/components/trip/customize-theme-sheet").then((mod) => ({
    default: mod.CustomizeThemeSheet,
  })),
);

const preloadCustomizeThemeSheet = () =>
  void import("@/components/trip/customize-theme-sheet");

const InviteMembersDialog = dynamic(() =>
  import("@/components/trip/invite-members-dialog").then((mod) => ({
    default: mod.InviteMembersDialog,
  })),
);

const preloadInviteMembersDialog = () =>
  void import("@/components/trip/invite-members-dialog");

const MemberOnboardingWizard = dynamic(() =>
  import("@/components/trip/member-onboarding-wizard").then((mod) => ({
    default: mod.MemberOnboardingWizard,
  })),
);

const PhotosSection = dynamic(
  () =>
    import("@/components/photos/photos-section").then((mod) => ({
      default: mod.PhotosSection,
    })),
  { ssr: false },
);

function SkeletonDetail() {
  return (
    <div>
      {/* Hero image skeleton */}
      <Skeleton className="h-64 sm:h-80 w-full rounded-none" />
      {/* Content skeleton */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-28 w-full rounded-md" />
      </div>
    </div>
  );
}

export function TripDetailContent({ tripId }: { tripId: string }) {
  const { data: trip, isPending, isError } = useTripDetail(tripId);
  const { data: events } = useEvents(tripId);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<{
    member: MemberWithProfile;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const removeMember = useRemoveMember(tripId);
  const updateRole = useUpdateMemberRole(tripId);
  const { user } = useAuth();
  const { data: members } = useQuery({
    ...membersQueryOptions(tripId),
    enabled: !!tripId,
    select: (data) =>
      data.map((m) => ({ id: m.id, userId: m.userId, isMuted: m.isMuted })),
  });
  const currentMember = members?.find((m) => m.userId === user?.id);
  const isMobile = useIsMobile();
  const { ref: itineraryRef } = useScrollReveal();
  const { data: weather, isLoading: weatherLoading } =
    useWeatherForecast(tripId);
  const temperatureUnit: TemperatureUnit =
    user?.temperatureUnit === "celsius" ? "celsius" : "fahrenheit";

  const handleUpdateRole = (
    member: MemberWithProfile,
    isOrganizer: boolean,
  ) => {
    updateRole.mutate(
      { memberId: member.id, isOrganizer },
      {
        onSuccess: () => {
          toast.success(
            isOrganizer
              ? `${member.displayName} is now a co-organizer`
              : `${member.displayName} is no longer a co-organizer`,
          );
        },
        onError: (error) => {
          const message = getUpdateMemberRoleErrorMessage(error);
          toast.error(message ?? "Failed to update member role");
        },
      },
    );
  };

  // Compute active event count (filter out soft-deleted events for safety)
  const activeEventCount = events?.filter((e) => !e.deletedAt).length ?? 0;

  // Determine if user is an organizer (from API response metadata)
  const isOrganizer = trip?.isOrganizer ?? false;

  // Check if trip is locked (one day after end date)
  const isLocked = useMemo(() => {
    if (!trip?.endDate) return false;
    const end = new Date(trip.endDate);
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return end < new Date();
  }, [trip?.endDate]);

  const dateRange = trip ? formatDateRange(trip.startDate, trip.endDate) : "";

  const preset = trip?.themeId
    ? (THEME_PRESETS.find((p) => p.id === trip.themeId) ?? null)
    : null;
  const heroTextLight =
    trip?.coverImageUrl ||
    preset?.defaultCoverUrl ||
    !preset ||
    preset.background.isDark;

  // Loading state
  if (isPending) {
    return <SkeletonDetail />;
  }

  // Error state
  if (isError || !trip) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card rounded-md border border-destructive/30 p-8 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2 font-playfair">
            Trip not found
          </h2>
          <p className="text-muted-foreground mb-6">
            This trip doesn't exist or you don't have access to it.
          </p>
          <Button variant="gradient" asChild className="h-12 px-8 rounded-md">
            <Link href="/trips">Return to trips</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Preview mode: show limited trip info with RSVP buttons
  if (trip.isPreview) {
    return (
      <TripPreview
        trip={trip}
        tripId={tripId}
        onGoingSuccess={() => setShowOnboarding(true)}
      />
    );
  }

  if (isMobile) {
    return (
      <MobileTripLayout
        trip={trip}
        tripId={tripId}
        isOrganizer={isOrganizer}
        isLocked={isLocked}
        activeEventCount={activeEventCount}
        weather={weather}
        weatherLoading={weatherLoading}
        temperatureUnit={temperatureUnit}
        currentMember={currentMember}
        user={user}
        removeMember={removeMember}
        handleUpdateRole={handleUpdateRole}
        initialShowOnboarding={showOnboarding}
      />
    );
  }

  return (
    <TripThemeProvider
      themeId={trip.themeId}
      themeFont={trip.themeFont}
      scope="page"
    >
      <div
        className="min-h-screen bg-background motion-safe:animate-[revealUp_400ms_ease-out_both]"
        style={preset ? { background: "var(--theme-background)" } : undefined}
      >
        {/* Hero section with cover image + overlay */}
        <div className="relative h-64 sm:h-80 overflow-hidden">
          {/* Background: cover photo → theme cover → theme gradient → default */}
          {trip.coverImageUrl ? (
            <Image
              src={getUploadUrl(trip.coverImageUrl)!}
              alt={trip.name}
              fill
              priority
              sizes="(min-width: 1024px) 1024px, 100vw"
              className="object-cover"
            />
          ) : preset?.defaultCoverUrl ? (
            <Image
              src={preset.defaultCoverUrl}
              alt={preset.name}
              fill
              priority
              sizes="(min-width: 1024px) 1024px, 100vw"
              className="object-cover"
            />
          ) : preset ? (
            <div
              className="absolute inset-0"
              style={{ background: "var(--theme-background)" }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/30">
              <TopoPattern className="opacity-[0.12] text-white" />
            </div>
          )}

          {/* Gradient scrim for text readability */}
          {(trip.coverImageUrl || preset?.defaultCoverUrl) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          )}

          {/* Bottom: title + metadata */}
          <div className="absolute bottom-0 left-0 right-0 pb-5 sm:pb-6">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-end">
              <div className="flex-1 min-w-0">
                <h1
                  className={`text-2xl sm:text-4xl font-bold ${heroTextLight ? "text-white" : "text-foreground"} font-playfair line-clamp-2 drop-shadow-sm`}
                  style={
                    trip.themeFont
                      ? {
                          fontFamily:
                            THEME_FONTS[
                              trip.themeFont as keyof typeof THEME_FONTS
                            ],
                        }
                      : undefined
                  }
                >
                  {trip.name}
                </h1>
                <div
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm sm:text-base ${heroTextLight ? "text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]" : "text-foreground/80"}`}
                >
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.destination)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 ${heroTextLight ? "hover:text-white" : "hover:text-foreground"} transition-colors min-w-0`}
                  >
                    <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{trip.destination}</span>
                  </a>
                  <span aria-hidden="true">&middot;</span>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{dateRange}</span>
                  </span>
                </div>
              </div>

              {/* Customize button */}
              {isOrganizer && (
                <button
                  onClick={() => setIsCustomizeOpen(true)}
                  onMouseEnter={
                    supportsHover ? preloadCustomizeThemeSheet : undefined
                  }
                  onTouchStart={preloadCustomizeThemeSheet}
                  onFocus={preloadCustomizeThemeSheet}
                  className={`shrink-0 ml-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm transition-colors cursor-pointer ${
                    heroTextLight
                      ? "bg-white/20 text-white hover:bg-white/30"
                      : "bg-black/10 text-foreground hover:bg-black/20"
                  }`}
                  aria-label="Customize theme"
                >
                  <Paintbrush className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Customize</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-2">
          <div className="mb-8">
            {/* RSVP + action icons */}
            <div className="flex items-center mb-6">
              <RsvpBadgeDropdown
                tripId={trip.id}
                status={trip.userRsvpStatus}
              />
              <span className="flex-1" aria-hidden="true" />
              <div className="flex items-center gap-3">
                {isOrganizer && (
                  <>
                    <button
                      onClick={() => setIsInviteOpen(true)}
                      onMouseEnter={
                        supportsHover ? preloadInviteMembersDialog : undefined
                      }
                      onTouchStart={preloadInviteMembersDialog}
                      onFocus={preloadInviteMembersDialog}
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      aria-label="Invite members"
                    >
                      <UserPlus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setIsEditOpen(true)}
                      onMouseEnter={
                        supportsHover ? preloadEditTripDialog : undefined
                      }
                      onTouchStart={preloadEditTripDialog}
                      onFocus={preloadEditTripDialog}
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      aria-label="Edit trip"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Organizers */}
            {trip.organizers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Organizers
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {trip.organizers.map((org) =>
                      org.profilePhotoUrl ? (
                        <Image
                          key={org.id}
                          src={getUploadUrl(org.profilePhotoUrl)!}
                          alt={org.displayName}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full ring-2 ring-white object-cover"
                        />
                      ) : (
                        <div
                          key={org.id}
                          className="w-8 h-8 rounded-full ring-2 ring-white bg-muted flex items-center justify-center text-xs font-medium text-foreground"
                        >
                          {getInitials(org.displayName)}
                        </div>
                      ),
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {trip.organizers.map((org) => org.displayName).join(", ")}
                  </span>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6">
              <button
                onClick={() => setIsMembersOpen(true)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Users className="w-5 h-5" />
                <span className="text-sm">
                  {trip.memberCount} member{trip.memberCount !== 1 ? "s" : ""}
                </span>
              </button>
              <button
                onClick={() => {
                  const target =
                    document.getElementById("day-today") ??
                    document.getElementById("itinerary");
                  target?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-sm">
                  {activeEventCount === 0
                    ? "No events yet"
                    : `${activeEventCount} event${activeEventCount === 1 ? "" : "s"}`}
                </span>
              </button>
              <MessageCountIndicator tripId={tripId} />
            </div>

            {/* About this trip */}
            <Collapsible defaultOpen className="mb-2">
              <CollapsibleTrigger className="flex items-center gap-2 px-0 text-sm font-semibold text-foreground hover:text-foreground/80 min-h-[44px] cursor-pointer">
                <ChevronDown
                  className="w-4 h-4 transition-transform duration-200 [[data-state=closed]_&]:-rotate-90"
                  aria-hidden="true"
                />
                About this trip
              </CollapsibleTrigger>
              <CollapsibleContent
                forceMount
                className="overflow-hidden data-[state=open]:animate-[collapsible-down_200ms_ease-out] data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=closed]:h-0"
              >
                <div className="mt-3 space-y-3">
                  {trip.description && (
                    <div className="bg-card rounded-md border border-border p-6 linen-texture">
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {trip.description}
                      </p>
                    </div>
                  )}
                  <WeatherForecastCard
                    weather={weather}
                    isLoading={weatherLoading}
                    temperatureUnit={temperatureUnit}
                    isDark={preset?.background.isDark ?? false}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Itinerary — outside padded container so sticky header works */}
        <div id="itinerary" ref={itineraryRef} className="scroll-mt-14">
          <ItineraryView
            tripId={tripId}
            onAddTravel={() => setShowOnboarding(true)}
            forecasts={weather?.forecasts}
            temperatureUnit={temperatureUnit}
          />
        </div>

        {/* Photos Section */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border-t border-border mt-6 pt-6">
            <PhotosSection
              tripId={trip.id}
              isOrganizer={isOrganizer}
              disabled={isLocked}
            />
          </div>
        </div>

        {/* Discussion */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="border-t border-border mt-6 pt-6">
            <ErrorBoundary>
              <TripMessages
                tripId={tripId}
                isOrganizer={isOrganizer}
                disabled={isLocked}
                isMuted={currentMember?.isMuted}
              />
            </ErrorBoundary>
          </div>
        </div>

        {/* Customize Theme Sheet */}
        {isOrganizer && trip && (
          <CustomizeThemeSheet
            trip={trip}
            open={isCustomizeOpen}
            onOpenChange={setIsCustomizeOpen}
          />
        )}

        {/* Edit Trip Dialog */}
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

        {/* Invite Members Dialog */}
        {isOrganizer && (
          <InviteMembersDialog
            open={isInviteOpen}
            onOpenChange={setIsInviteOpen}
            tripId={tripId}
          />
        )}

        {/* Settings Sheet */}
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

        {/* Members Sheet */}
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
                          onError: (error) => {
                            const message = getRemoveMemberErrorMessage(error);
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
