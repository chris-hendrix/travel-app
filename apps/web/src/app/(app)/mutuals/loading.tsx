import { Skeleton } from "@/components/ui/skeleton";

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

export default function MutualsLoading() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-24" />
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Skeleton className="h-12 flex-1 rounded-md" />
          <Skeleton className="h-12 w-full sm:w-[200px]" />
        </div>

        {/* Mutuals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <MutualCardSkeleton />
          <MutualCardSkeleton />
          <MutualCardSkeleton />
          <MutualCardSkeleton />
          <MutualCardSkeleton />
          <MutualCardSkeleton />
        </div>
      </div>
    </div>
  );
}
