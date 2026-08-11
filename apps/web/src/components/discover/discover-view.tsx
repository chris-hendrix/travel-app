"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Compass,
  AlertCircle,
  ChevronDown,
  Dumbbell,
  Palette,
  ShoppingBag,
  Sparkles,
  TreePine,
  Utensils,
} from "lucide-react";
import type { POISuggestion, POICategoryKey, TemperatureUnit, Event } from "@journiful/shared/types";
import { POI_CATEGORIES } from "@journiful/shared/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateEventDialog } from "@/components/itinerary/create-event-dialog";
import { useTripDetail } from "@/hooks/use-trips";
import { useAccommodations } from "@/hooks/use-accommodations";
import { useAuth } from "@/app/providers/auth-provider";
import {
  useDiscover,
  useConvertPOI,
} from "@/hooks/use-discover";
import { POICard } from "./poi-card";
import { POIDetailSheet } from "./poi-detail-sheet";
import { LocationPickerSheet } from "./location-picker-sheet";

// ─── Category icons ──────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<POICategoryKey, typeof Utensils> = {
  food_and_drink: Utensils,
  arts_and_entertainment: Palette,
  outdoors: TreePine,
  nightlife: Sparkles,
  wellness: Dumbbell,
  shopping: ShoppingBag,
};

// ─── Location type ───────────────────────────────────────────────────────────

interface LocationOption {
  lat: number;
  lon: number;
  name: string;
  source: "trip" | "accommodation";
  accommodationId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DiscoverViewProps {
  tripId: string;
  temperatureUnit: TemperatureUnit;
}

export function DiscoverView({ tripId, temperatureUnit }: DiscoverViewProps) {
  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: trip } = useTripDetail(tripId);
  const { data: accommodations } = useAccommodations(tripId);
  const { user } = useAuth();

  // ── Location resolution: first accommodation with coords → trip destination ─

  const availableLocations = useMemo<LocationOption[]>(() => {
    const locations: LocationOption[] = [];

    // Trip destination (if has coords)
    if (trip?.destinationLat != null && trip?.destinationLon != null) {
      locations.push({
        lat: trip.destinationLat,
        lon: trip.destinationLon,
        name: trip.destination || "Trip destination",
        source: "trip",
      });
    }

    // Accommodations with coords
    if (accommodations) {
      for (const acc of accommodations) {
        if (acc.addressLat != null && acc.addressLon != null) {
          locations.push({
            lat: acc.addressLat,
            lon: acc.addressLon,
            name: acc.name,
            source: "accommodation",
            accommodationId: acc.id,
          });
        }
      }
    }

    return locations;
  }, [trip, accommodations]);

  const defaultLocation = availableLocations.length > 0 ? availableLocations[0] : null;

  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  const location = selectedLocation ?? defaultLocation;

  const {
    data: discover,
    isPending,
    isError,
    error,
    refetch,
  } = useDiscover(
    tripId,
    location?.lat ?? null,
    location?.lon ?? null,
    location?.name,
  );

  const convertPOI = useConvertPOI(tripId);

  // ── Organizer check ────────────────────────────────────────────────────────

  const isOrganizer = useMemo(
    () =>
      !!user &&
      !!trip &&
      (trip.createdBy === user.id ||
        trip.organizers?.some((org: { id: string }) => org.id === user.id)),
    [user, trip],
  );

  // ── POI → Event flow ──────────────────────────────────────────────────────

  const [selectedPOIIndex, setSelectedPOIIndex] = useState<number | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [pendingCreateEvent, setPendingCreateEvent] = useState(false);

  // Flatten all POIs for prev/next navigation
  const allPois = useMemo(() => {
    if (!discover) return [];
    return POI_CATEGORIES.flatMap((cat) => discover.categories[cat.id] ?? []);
  }, [discover]);

  // Derive selectedPOI from index
  const selectedPOI: POISuggestion | null =
    selectedPOIIndex != null ? (allPois[selectedPOIIndex] ?? null) : null;

  const handlePOISelect = useCallback((poi: POISuggestion) => {
    const idx = allPois.findIndex((p) => p.sourceId === poi.sourceId);
    setSelectedPOIIndex(idx >= 0 ? idx : null);
    setIsDetailSheetOpen(true);
  }, [allPois]);

  const handlePrev = useCallback(() => {
    setSelectedPOIIndex((prev) => (prev != null ? Math.max(0, prev - 1) : 0));
  }, []);

  const handleNext = useCallback(() => {
    setSelectedPOIIndex((prev) =>
      prev != null ? Math.min(allPois.length - 1, prev + 1) : 0,
    );
  }, [allPois.length]);

  // Called by POIDetailSheet when "Create Event" is clicked
  const handleCreateEventFromDetail = useCallback((_poi: POISuggestion) => {
    setIsDetailSheetOpen(false);
    setPendingCreateEvent(true);
  }, []);

  const handleEventCreated = useCallback((event: Event) => {
    setIsCreateDialogOpen(false);
    // Immediately convert the POI using the event ID from the mutation response
    if (selectedPOI) {
      convertPOI.mutate({
        sourceId: selectedPOI.sourceId,
        eventId: event.id,
      });
    }
  }, [selectedPOI, convertPOI]);

  useEffect(() => {
    if (!isDetailSheetOpen && pendingCreateEvent) {
      setIsCreateDialogOpen(true);
      setPendingCreateEvent(false);
    }
  }, [isDetailSheetOpen, pendingCreateEvent]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasNoDestination = !location;
  const hasResults = discover && !hasNoDestination;

  // ── Empty: no destination set ─────────────────────────────────────────────
  // Must check BEFORE isPending — when location is null, the discover query is
  // disabled and TanStack Query v5 reports isPending=true (status "pending"
  // with no fetch). If we checked isPending first we'd show infinite loading.

  if (hasNoDestination) {
    return (
      <EmptyState
        icon={Compass}
        title="No destination set"
        description="Set a trip destination to discover nearby places"
        variant="card"
      />
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-4 overflow-hidden">
          <Skeleton className="h-36 w-[200px] shrink-0 rounded-md" />
          <Skeleton className="h-36 w-[200px] shrink-0 rounded-md" />
          <Skeleton className="h-36 w-[200px] shrink-0 rounded-md" />
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="bg-card rounded-md border border-destructive/30 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2 font-playfair">
          Failed to load suggestions
        </h2>
        <p className="text-muted-foreground mb-6 text-sm">
          {error instanceof Error
            ? error.message
            : "There was an error loading nearby places."}
        </p>
        <Button
          variant="gradient"
          onClick={() => refetch()}
          className="h-11 px-6 rounded-md"
        >
          Retry
        </Button>
      </div>
    );
  }

  // ── Empty: fetched but no POIs returned ───────────────────────────────────

  if (hasResults && POI_CATEGORIES.every((cat) => !discover.categories[cat.id]?.length)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground font-playfair flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            Discover
          </h2>
        </div>
        <EmptyState
          icon={Compass}
          title="No places found"
          description={`No places found near ${location?.name ?? "this location"}`}
          variant="card"
        />
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  const timezone = trip?.preferredTimezone || "UTC";

  return (
    <div className="space-y-6">
      {/* Location picker */}
      {location?.name && (
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">near</span>
          {isOrganizer ? (
            <button
              type="button"
              onClick={() => setIsLocationPickerOpen(true)}
              className="inline-flex items-center gap-0.5 text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer rounded px-1 -ml-1 min-w-0"
            >
              <span className="truncate max-w-[160px]">{location.name}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
              {location.name}
            </span>
          )}
        </div>
      )}

      {/* Category sections */}
      {discover &&
        POI_CATEGORIES.map((cat) => {
          const pois = discover.categories[cat.id];
          if (!pois || pois.length === 0) return null;

          const Icon = CATEGORY_ICONS[cat.id];

          return (
            <section key={cat.id} className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="w-4 h-4" />
                {cat.label}
              </h3>

              {/* Horizontally scrollable row with peek + fade */}
              <div className="no-swipe flex gap-3 overflow-x-auto pb-2 pr-10 scrollbar-none snap-x snap-mandatory [mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent_100%)]">
                {pois.map((poi) => (
                  <div key={poi.sourceId} className="snap-start">
                    <POICard poi={poi} onSelect={handlePOISelect} temperatureUnit={temperatureUnit} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

      {/* Google Places attribution */}
      {discover && (
        <div className="text-center space-y-1 py-4">
          <p className="text-xs text-muted-foreground">Powered by Google</p>
          {discover.attributions && discover.attributions.length > 0 && (
            <p className="text-[10px] text-muted-foreground/60">
              {discover.attributions.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* POI Detail Sheet */}
      <POIDetailSheet
        poi={selectedPOI}
        open={isDetailSheetOpen}
        onOpenChange={setIsDetailSheetOpen}
        onCreateEvent={handleCreateEventFromDetail}
        temperatureUnit={temperatureUnit}
        onPrev={handlePrev}
        onNext={handleNext}
        hasPrev={selectedPOIIndex != null && selectedPOIIndex > 0}
        hasNext={selectedPOIIndex != null && selectedPOIIndex < allPois.length - 1}
        poiIndex={selectedPOIIndex ?? 0}
        totalPois={allPois.length}
      />

      {/* Location Picker Sheet (organizer only) */}
      <LocationPickerSheet
        open={isLocationPickerOpen}
        onOpenChange={setIsLocationPickerOpen}
        tripDestination={
          trip?.destinationLat != null && trip?.destinationLon != null
            ? {
                lat: trip.destinationLat,
                lon: trip.destinationLon,
                name: trip.destination || "Trip destination",
              }
            : null
        }
        accommodations={
          accommodations
            ?.filter((acc): acc is typeof acc & { addressLat: number; addressLon: number } =>
              acc.addressLat != null && acc.addressLon != null
            )
            .map((acc) => ({
              id: acc.id,
              name: acc.name,
              address: acc.address ?? null,
              addressLat: acc.addressLat,
              addressLon: acc.addressLon,
            })) ?? []
        }
        selectedLocation={
          location
            ? { lat: location.lat, lon: location.lon, name: location.name }
            : { lat: 0, lon: 0, name: "" }
        }
        onSelect={(loc) => {
          setSelectedLocation({
            lat: loc.lat,
            lon: loc.lon,
            name: loc.name,
            source: "trip",
          });
        }}
      />

      {/* Create Event Dialog (triggered by detail sheet) */}
      <CreateEventDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        tripId={tripId}
        timezone={timezone}
        onSuccess={handleEventCreated}
        tripStartDate={trip?.startDate || null}
        tripEndDate={trip?.endDate || null}
        tripLat={trip?.destinationLat ?? null}
        tripLon={trip?.destinationLon ?? null}
        {...(selectedPOI
          ? {
              defaultValues: {
                name: selectedPOI.name,
                eventType: selectedPOI.category,
                location: selectedPOI.address ?? "",
                locationLat: selectedPOI.lat,
                locationLon: selectedPOI.lon,
              },
            }
          : {})}
      />
    </div>
  );
}
