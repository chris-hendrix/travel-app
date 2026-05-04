"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Compass,
  Navigation,
  RotateCcw,
  Utensils,
  Palette,
  TreePine,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import type { POISuggestion, POICategoryKey } from "@journiful/shared/types";
import { POI_CATEGORIES } from "@journiful/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateEventDialog } from "@/components/itinerary/create-event-dialog";
import { useTripDetail } from "@/hooks/use-trips";
import { useEvents } from "@/hooks/use-events";
import {
  useDiscover,
  useRefreshDiscover,
  useConvertPOI,
} from "@/hooks/use-discover";
import { POICard } from "./poi-card";

// ─── Category icons & labels ────────────────────────────────────────────────

const CATEGORY_ICONS: Record<POICategoryKey, typeof Utensils> = {
  food_and_drink: Utensils,
  arts_and_entertainment: Palette,
  outdoors: TreePine,
  nightlife: Sparkles,
};

interface DiscoverViewProps {
  tripId: string;
}

/**
 * Discover tab – POI (Point of Interest) suggestions for a trip destination.
 *
 * Renders a heading with a manual refresh button, filter pills to toggle
 * POI categories, and a horizontal-scrolling list of POI cards per category.
 * Clicking a card opens the CreateEventDialog pre-filled with the POI's name,
 * category, and location. On successful event creation the POI is marked as
 * converted via PATCH /discover/convert so it no longer shows.
 */
export function DiscoverView({ tripId }: DiscoverViewProps) {
  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: trip } = useTripDetail(tripId);
  const { data: events } = useEvents(tripId);
  const {
    data: discover,
    isPending,
    isError,
    error,
    refetch,
  } = useDiscover(tripId);
  const { refresh } = useRefreshDiscover(tripId);
  const convertPOI = useConvertPOI(tripId);

  // ── Filter state ──────────────────────────────────────────────────────────

  const [visibleCategories, setVisibleCategories] = useState<
    Set<POICategoryKey>
  >(() => new Set(POI_CATEGORIES.map((c) => c.id)));

  const toggleCategory = useCallback((id: POICategoryKey) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Keep at least one active
        if (next.size === 0) return prev;
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ── POI → Event conversion flow ──────────────────────────────────────────

  const [selectedPOI, setSelectedPOI] = useState<POISuggestion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogJustClosed, setDialogJustClosed] = useState(0);

  const handlePOISelect = useCallback((poi: POISuggestion) => {
    setSelectedPOI(poi);
    setIsDialogOpen(true);
  }, []);

  const handleEventCreated = useCallback(() => {
    setIsDialogOpen(false);
    setDialogJustClosed((n) => n + 1);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
  }, []);

  // When the CreateEventDialog successfully creates an event, wait for the
  // events list to refetch (triggered by useCreateEvent's onSettled), then
  // read the real event from cache and mark the POI as converted.
  useEffect(() => {
    if (dialogJustClosed > 0 && selectedPOI && events && events.length > 0) {
      const matchingEvent = events.find(
        (e) =>
          !e.id.startsWith("temp-") && e.name === selectedPOI.name,
      );
      if (matchingEvent) {
        convertPOI.mutate({
          sourceId: selectedPOI.sourceId,
          eventId: matchingEvent.id,
        });
      }
      setSelectedPOI(null);
    }
    // We intentionally depend on `events` so the effect re-runs after refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogJustClosed, events]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasNoDestination =
    discover && (discover.destination === null || discover.destination === "");
  const hasResults = discover && !hasNoDestination;

  const visiblePOICount = useMemo(() => {
    if (!discover) return 0;
    let count = 0;
    for (const [cat, pois] of Object.entries(discover.categories)) {
      if (visibleCategories.has(cat as POICategoryKey)) {
        count += pois.length;
      }
    }
    return count;
  }, [discover, visibleCategories]);

  // ── Refresh handler ───────────────────────────────────────────────────────

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          <Skeleton className="h-44 w-56 shrink-0 rounded-md" />
          <Skeleton className="h-44 w-56 shrink-0 rounded-md" />
          <Skeleton className="h-44 w-56 shrink-0 rounded-md" />
          <Skeleton className="h-44 w-56 shrink-0 rounded-md" />
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

  // ── Empty: no destination set ─────────────────────────────────────────────

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

  // ── Empty: fetched but no POIs returned ───────────────────────────────────

  if (hasResults && visiblePOICount === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground font-playfair flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            Discover
          </h2>
        </div>
        <EmptyState
          icon={Navigation}
          title="No places found"
          description="No places found near this destination"
          variant="card"
        />
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  const timezone = trip?.preferredTimezone || "UTC";

  return (
    <div className="space-y-6">
      {/* Heading + Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground font-playfair flex items-center gap-2">
          <Compass className="w-5 h-5 text-primary" />
          Discover
          {discover?.destination && (
            <span className="text-sm font-normal text-muted-foreground font-sans">
              near{" "}
              <span className="font-medium text-foreground">
                {discover.destination}
              </span>
            </span>
          )}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-1.5"
        >
          <RotateCcw
            className={cn("w-4 h-4", isRefreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Partial data warning */}
      {discover?.partial && (
        <div className="flex items-start gap-2 rounded-sm bg-warning/10 border border-warning/30 p-3 text-sm text-warning-foreground">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Some categories couldn't be loaded. Results may be incomplete.
          </span>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {POI_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.id];
          const isActive = visibleCategories.has(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
                "text-xs font-medium transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-muted text-muted-foreground border border-border hover:bg-secondary",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Category sections */}
      {discover &&
        POI_CATEGORIES.map((cat) => {
          if (!visibleCategories.has(cat.id)) return null;
          const pois = discover.categories[cat.id];
          if (!pois || pois.length === 0) return null;

          const Icon = CATEGORY_ICONS[cat.id];

          return (
            <section key={cat.id} className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="w-4 h-4" />
                {cat.label}
                <span className="text-xs font-normal text-muted-foreground">
                  ({pois.length})
                </span>
              </h3>

              {/* Horizontally scrollable row */}
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
                {pois.map((poi) => (
                  <div key={poi.sourceId} className="snap-start">
                    <POICard poi={poi} onSelect={handlePOISelect} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

      {/* Create Event Dialog (triggered by POI card click) */}
      <CreateEventDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
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
