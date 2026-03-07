"use client";

import { playfairDisplay, plusJakartaSans, spaceGrotesk } from "@/lib/fonts";
import { cn } from "@/lib/utils";

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
      className={cn(playfairDisplay.variable, plusJakartaSans.variable, spaceGrotesk.variable)}
    >
      <body className="bg-background text-foreground antialiased">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground">
              {error.message ||
                "An unexpected error occurred. Please try again later."}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
