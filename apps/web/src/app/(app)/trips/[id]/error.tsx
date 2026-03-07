"use client";

import { Button } from "@/components/ui/button";

export default function TripError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">
          {error.message || "We couldn't load this trip. Please try again."}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
