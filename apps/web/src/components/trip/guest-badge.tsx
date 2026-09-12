import { cn } from "@/lib/utils";

/**
 * Visible marker for guest members (no attached user account).
 * Pairs the dashed "claim pending" ring with explicit text so the
 * guest/claimed distinction is available to sighted users and screen
 * readers alike (the ring alone is aria-hidden and low-contrast).
 */
export function GuestBadge({
  className,
  label = "Guest",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-full border border-dashed border-muted-foreground"
      />
      <span>{label}</span>
    </span>
  );
}
