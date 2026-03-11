import { Skeleton } from "@/components/ui/skeleton";

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

export default function TripsLoading() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-12 w-full mb-8 rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
