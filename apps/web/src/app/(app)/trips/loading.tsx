import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard() {
  return (
    <div className="bg-card rounded-lg overflow-hidden border border-border">
      <div className="relative h-48">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="absolute top-3 left-3 flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-4 w-2/3" />
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

export default function TripsLoading() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-48 mb-4" />
        <Skeleton className="h-5 w-24 mb-8" />
        <Skeleton className="h-12 w-full mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
