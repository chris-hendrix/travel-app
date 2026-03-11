"use client";

import { playfairDisplay, plusJakartaSans, spaceGrotesk } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        playfairDisplay.variable,
        plusJakartaSans.variable,
        spaceGrotesk.variable,
      )}
    >
      <body className="bg-background text-foreground antialiased">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground">
              {error.message ||
                "An unexpected error occurred. Please try again later."}
            </p>
            <Button onClick={reset}>Try again</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
