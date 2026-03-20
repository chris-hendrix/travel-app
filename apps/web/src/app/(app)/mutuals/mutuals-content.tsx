"use client";

import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { Search, Users, AlertCircle, Loader2 } from "lucide-react";
import type { Mutual } from "@journiful/shared/types";
import { useMutuals } from "@/hooks/use-mutuals";
import { tripsQueryOptions } from "@/hooks/use-trips";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MutualProfileSheet } from "@/components/mutuals/mutual-profile-sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";

function MutualCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

export function MutualsContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [selectedMutual, setSelectedMutual] = useState<Mutual | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { ref: gridRevealRef, isRevealed: gridRevealed } = useScrollReveal();

  // Debounce search input by 300ms
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchQuery);
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
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMutuals({
    search: debouncedSearch || undefined,
    tripId: selectedTripId || undefined,
  });

  const { data: tripsData } = useInfiniteQuery({
    ...tripsQueryOptions,
    select: (data) =>
      data.pages.flatMap((p) =>
        p.data.map((t) => ({ id: t.id, name: t.name })),
      ),
  });

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const mutuals = data?.pages.flatMap((page) => page.mutuals) ?? [];
  const trips = tripsData ?? [];
  const isEmpty = mutuals.length === 0 && !isPending && !isError;
  const mutualCount = mutuals.length;

  return (
    <div className="min-h-screen bg-background pb-24 motion-safe:animate-[revealUp_400ms_ease-out_both] gradient-mesh">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-2 font-playfair">
            My Mutuals
          </h1>
          {!isPending && !isError && (
            <p className="text-muted-foreground">
              {mutualCount} mutual{mutualCount !== 1 ? "s" : ""}
            </p>
          )}
        </header>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search mutuals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
            />
          </div>
          {trips.length > 0 && (
            <Select
              value={selectedTripId}
              onValueChange={(value) =>
                setSelectedTripId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="h-12 w-full sm:w-[200px]">
                <SelectValue placeholder="All trips" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trips</SelectItem>
                {trips.map((trip) => (
                  <SelectItem key={trip.id} value={trip.id}>
                    {trip.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Loading State */}
        {isPending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <MutualCardSkeleton />
            <MutualCardSkeleton />
            <MutualCardSkeleton />
            <MutualCardSkeleton />
            <MutualCardSkeleton />
            <MutualCardSkeleton />
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-card rounded-lg border border-destructive/30 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2 font-playfair">
              Failed to load mutuals
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

        {/* Empty State */}
        {isEmpty && (
          <EmptyState
            icon={Users}
            title="No mutuals yet"
            description="Mutuals are people who share trips with you. Start a trip and invite friends to see them here."
            className="rounded-lg p-12"
          />
        )}

        {/* Mutuals Grid */}
        {!isPending && !isError && mutuals.length > 0 && (
          <div
            ref={gridRevealRef}
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${gridRevealed ? "motion-safe:animate-[revealUp_400ms_ease-out_both]" : "motion-safe:opacity-0"}`}
            aria-live="polite"
          >
            {mutuals.map((mutual, index) => (
              <div
                key={mutual.id}
                role="button"
                tabIndex={0}
                className={`bg-card rounded-lg border border-border p-6 hover:border-primary/30 transition-colors cursor-pointer ${gridRevealed ? "motion-safe:animate-[staggerIn_500ms_ease-out_both]" : "motion-safe:opacity-0"}`}
                style={
                  gridRevealed
                    ? { animationDelay: `${index * 80}ms` }
                    : undefined
                }
                onClick={() => setSelectedMutual(mutual)}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedMutual(mutual);
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  <Avatar size="lg">
                    <AvatarImage
                      src={getUploadUrl(mutual.profilePhotoUrl)}
                      alt={mutual.displayName}
                    />
                    <AvatarFallback>
                      {getInitials(mutual.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {mutual.displayName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {mutual.sharedTripCount} shared trip
                      {mutual.sharedTripCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {/* Loading more indicator */}
        {isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <MutualProfileSheet
        mutual={selectedMutual}
        open={!!selectedMutual}
        onOpenChange={(open) => {
          if (!open) setSelectedMutual(null);
        }}
      />
    </div>
  );
}
