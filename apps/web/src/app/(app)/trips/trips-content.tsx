"use client";

import { useState, useMemo, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Search, AlertCircle, Loader2 } from "lucide-react";
import { useTrips, type TripSummary } from "@/hooks/use-trips";
import { TripCard } from "@/components/trip/trip-card";
import { CreateTripDialog } from "@/components/trip/create-trip-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { PostmarkStamp } from "@/components/ui/postmark-stamp";
import { EmptyState } from "@/components/ui/empty-state";

function SkeletonCard() {
  return (
    <div className="postcard-mat" style={{ background: "var(--color-secondary)" }}>
      <div className="postcard-image">
        <Skeleton className="absolute inset-0 rounded-none" />
      </div>
    </div>
  );
}

export function TripsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const mounted = useMounted();
  const { ref: upcomingSectionRef, isRevealed: upcomingRevealed } =
    useScrollReveal();
  const { ref: pastSectionRef, isRevealed: pastRevealed } = useScrollReveal();

  // Refs for values used inside the debounced effect to avoid unnecessary re-fires
  const searchParamsRef = useRef(searchParams);
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Sync search query to URL with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (searchQuery) {
        params.set("q", searchQuery);
      } else {
        params.delete("q");
      }
      const queryString = params.toString();
      // Only replace URL if the query string actually changed
      if (queryString !== searchParamsRef.current.toString()) {
        const path = pathnameRef.current;
        routerRef.current.replace(
          queryString ? `${path}?${queryString}` : path,
          {
            scroll: false,
          },
        );
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useTrips();

  const trips = data?.pages.flatMap((p) => p.data) ?? [];

  // Filter trips by search query (case-insensitive, searches name and destination)
  const filteredTrips = useMemo(() => {
    if (!searchQuery.trim()) return trips;

    const query = searchQuery.toLowerCase();
    return trips.filter(
      (trip) =>
        trip.name.toLowerCase().includes(query) ||
        trip.destination.toLowerCase().includes(query),
    );
  }, [trips, searchQuery]);

  // Split trips into upcoming and past based on start date
  const { upcomingTrips, pastTrips } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming: TripSummary[] = [];
    const past: TripSummary[] = [];
    for (const trip of filteredTrips) {
      if (!trip.startDate) {
        upcoming.push(trip);
        continue;
      }
      const startDate = new Date(trip.startDate);
      if (startDate >= today) {
        upcoming.push(trip);
      } else {
        past.push(trip);
      }
    }
    return { upcomingTrips: upcoming, pastTrips: past };
  }, [filteredTrips]);

  const tripCount = data?.pages[0]?.meta?.total ?? trips.length;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const noResults = filteredTrips.length === 0 && hasSearchQuery;
  const isEmpty = trips.length === 0 && !isPending;

  return (
    <div className="min-h-screen bg-background pb-24 motion-safe:animate-[revealUp_400ms_ease-out_both] gradient-mesh linen-texture">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-2 font-[family-name:var(--font-playfair)]">
            My Trips
          </h1>
          {!isPending && !isError && (
            <p className="text-muted-foreground">
              {tripCount} trip{tripCount !== 1 ? "s" : ""}
            </p>
          )}
        </header>

        {/* Search Bar */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search trips..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
          />
        </div>

        {/* Loading State */}
        {isPending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-card rounded-md border border-destructive/30 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2 font-accent">
              Failed to load trips
            </h2>
            <p className="text-muted-foreground mb-6">
              {error?.message || "An unexpected error occurred"}
            </p>
            <Button
              onClick={() => refetch()}
              disabled={isFetching}
              variant="gradient"
              className="h-12 px-8 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFetching && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isFetching ? "Loading..." : "Try again"}
            </Button>
          </div>
        )}

        {/* Empty State (no trips at all) */}
        {isEmpty && (
          <div className="relative overflow-hidden bg-card rounded-md border border-border p-12 text-center linen-texture">
            <div className="absolute top-4 right-4 opacity-50">
              <PostmarkStamp date="2026" city="TRIPFUL" size="lg" />
            </div>
            <div className="relative max-w-md mx-auto">
              <p className="text-2xl text-accent mb-2 font-[family-name:var(--font-script)]">
                No postcards yet...
              </p>
              <h2 className="text-xl font-semibold text-foreground mb-2 font-accent">
                Your adventures await
              </h2>
              <p className="text-muted-foreground mb-6">
                Start planning your next adventure by creating your first trip.
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                variant="gradient"
                className="h-12 px-8"
              >
                <Plus className="w-5 h-5 mr-2" strokeWidth={2.5} />
                Create your first trip
              </Button>
            </div>
          </div>
        )}

        {/* No Search Results */}
        {noResults && (
          <EmptyState
            icon={Search}
            title="No trips found"
            description="Try searching with different keywords"
          />
        )}

        {/* Trips Sections */}
        {!isPending && !isError && !isEmpty && !noResults && (
          <div aria-live="polite">
            {/* Upcoming Trips */}
            {upcomingTrips.length > 0 && (
              <section
                ref={
                  upcomingSectionRef as RefObject<HTMLElement>
                }
                className={`mb-12 ${upcomingRevealed ? "motion-safe:animate-[revealUp_400ms_ease-out_both]" : "motion-safe:opacity-0"}`}
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 font-[family-name:var(--font-playfair)]">
                  Upcoming trips
                  <span className="block text-xs font-normal text-muted-foreground font-accent tracking-wider uppercase mt-1">Departures</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {upcomingTrips.map((trip, index) => (
                    <TripCard key={trip.id} trip={trip} index={index} />
                  ))}
                </div>
              </section>
            )}

            {/* Past Trips */}
            {pastTrips.length > 0 && (
              <section
                ref={
                  pastSectionRef as RefObject<HTMLElement>
                }
                className={pastRevealed ? "motion-safe:animate-[revealUp_400ms_ease-out_both]" : "motion-safe:opacity-0"}
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 font-[family-name:var(--font-playfair)]">
                  Past trips
                  <span className="block text-xs font-normal text-muted-foreground font-accent tracking-wider uppercase mt-1">Memories</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {pastTrips.map((trip, index) => (
                    <TripCard key={trip.id} trip={trip} index={index} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) — portaled to body to escape ancestor transforms that break position:fixed */}
      {mounted &&
        createPortal(
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="gradient"
            size="icon"
            className="fixed bottom-safe-6 right-6 sm:bottom-safe-8 sm:right-8 w-14 h-14 rounded-full z-50"
            aria-label="Create new trip"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </Button>,
          document.body,
        )}

      {/* Create Trip Dialog */}
      <CreateTripDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
