"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Search, AlertCircle, Loader2 } from "lucide-react";
import { useTrips, type TripSummary } from "@/hooks/use-trips";
import { TripCard } from "@/components/trip/trip-card";
import { CreateTripDialog } from "@/components/trip/create-trip-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { PostmarkStamp } from "@/components/ui/postmark-stamp";
import { EmptyState } from "@/components/ui/empty-state";

function SkeletonCard() {
  return (
    <div
      className="postcard-mat"
      style={{ background: "var(--color-secondary)" }}
    >
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
  const initialQuery = searchParams.get("q") ?? "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(initialQuery.length > 0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { ref: currentSectionRef, isRevealed: currentRevealed } =
    useScrollReveal();
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

  const { data, isPending, isError, error, refetch, isFetching } = useTrips();

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

  // Split trips into current, upcoming, and past
  // Current: startDate <= today <= effectiveEnd (trips happening now)
  // Upcoming: startDate > today (trips that haven't started yet)
  // Past: effectiveEnd < today
  const { currentTrips, upcomingTrips, pastTrips } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const current: TripSummary[] = [];
    const upcoming: TripSummary[] = [];
    const past: TripSummary[] = [];
    for (const trip of filteredTrips) {
      if (!trip.startDate) {
        upcoming.push(trip);
        continue;
      }
      const startDate = new Date(trip.startDate);
      startDate.setHours(0, 0, 0, 0);
      const effectiveEnd = new Date(trip.endDate ?? trip.startDate);
      effectiveEnd.setDate(effectiveEnd.getDate() + 1);
      effectiveEnd.setHours(23, 59, 59, 999);
      if (startDate <= today && effectiveEnd >= today) {
        current.push(trip);
      } else if (startDate > today) {
        upcoming.push(trip);
      } else {
        past.push(trip);
      }
    }
    return { currentTrips: current, upcomingTrips: upcoming, pastTrips: past };
  }, [filteredTrips]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearchQuery("");
      } else {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      return !prev;
    });
  }, []);

  const tripCount = data?.pages[0]?.meta?.total ?? trips.length;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const noResults = filteredTrips.length === 0 && hasSearchQuery;
  const isEmpty = trips.length === 0 && !isPending;

  return (
    <div className="min-h-screen bg-background pb-24 motion-safe:animate-[revealUp_400ms_ease-out_both] gradient-mesh linen-texture">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-2 font-playfair">
              My Trips
            </h1>
            {!isPending && !isError && (
              <p className="text-muted-foreground">
                {tripCount} trip{tripCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={toggleSearch}
              variant="outline"
              size="icon"
              aria-label={searchOpen ? "Close search" : "Search trips"}
            >
              <Search />
            </Button>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="outline"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New Trip
            </Button>
          </div>
        </header>

        {/* Search Bar */}
        <div
          className={`grid transition-all duration-200 ease-out ${searchOpen ? "grid-rows-[1fr] opacity-100 mb-8" : "grid-rows-[0fr] opacity-0 mb-0"}`}
        >
          <div className="overflow-hidden">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name or destination..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 pl-12 text-base rounded-md"
              />
            </div>
          </div>
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
            <h2 className="text-2xl font-semibold text-foreground mb-2 font-playfair">
              Failed to load trips
            </h2>
            <p className="text-muted-foreground mb-6">
              {error?.message || "An unexpected error occurred"}
            </p>
            <Button
              onClick={() => refetch()}
              disabled={isFetching}
              variant="gradient"
              size="lg"
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
              <PostmarkStamp date="2026" city="JOURNIFUL" size="lg" />
            </div>
            <div className="relative max-w-md mx-auto">
              <p className="text-2xl text-accent mb-2 font-script">
                No trips yet...
              </p>
              <h2 className="text-xl font-semibold text-foreground mb-2 font-playfair">
                Your adventures await
              </h2>
              <p className="text-muted-foreground mb-6">
                Invite friends, plan together, and keep everything in one place.
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                variant="gradient"
                size="lg"
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
            {/* Current Trips */}
            {currentTrips.length > 0 && (
              <section
                ref={currentSectionRef}
                className={`mb-12 ${currentRevealed ? "motion-safe:animate-[revealUp_400ms_ease-out_both]" : "motion-safe:opacity-0"}`}
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 font-playfair">
                  Current trips
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {currentTrips.map((trip, index) => (
                    <TripCard key={trip.id} trip={trip} index={index} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming Trips */}
            {upcomingTrips.length > 0 && (
              <section
                ref={upcomingSectionRef}
                className={`mb-12 ${upcomingRevealed ? "motion-safe:animate-[revealUp_400ms_ease-out_both]" : "motion-safe:opacity-0"}`}
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 font-playfair">
                  Upcoming trips
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
                ref={pastSectionRef}
                className={
                  pastRevealed
                    ? "motion-safe:animate-[revealUp_400ms_ease-out_both]"
                    : "motion-safe:opacity-0"
                }
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 font-playfair">
                  Past trips
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

      {/* Create Trip Dialog */}
      <CreateTripDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
