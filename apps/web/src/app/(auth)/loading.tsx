import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <div className="w-full max-w-md">
      <div className="bg-card rounded-md shadow-2xl p-8 lg:p-12 border border-border/50">
        <div className="space-y-6">
          {/* Title and description */}
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Form field label */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            {/* Input */}
            <Skeleton className="h-12 w-full rounded-md" />
            {/* Helper text */}
            <Skeleton className="h-3 w-56" />
          </div>

          {/* Submit button */}
          <Skeleton className="h-12 w-full rounded-md" />

          {/* Footer text */}
          <Skeleton className="h-3 w-72 mx-auto" />
        </div>
      </div>
    </div>
  );
}
