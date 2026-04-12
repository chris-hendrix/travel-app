"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { impersonating, stopImpersonating } = useAuth();

  if (!impersonating.active) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Impersonating{" "}
        <strong>{impersonating.user?.displayName ?? "Unknown User"}</strong>
      </span>
      <Button
        variant="outline"
        size="xs"
        className="border-amber-700 bg-amber-400 text-amber-950 hover:bg-amber-300"
        onClick={stopImpersonating}
      >
        Stop Impersonating
      </Button>
    </div>
  );
}
