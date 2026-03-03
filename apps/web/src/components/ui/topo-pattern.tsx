import { cn } from "@/lib/utils";

/**
 * Decorative vintage postmark/stamp SVG background pattern.
 * Renders at low opacity for use behind empty states.
 */
export function TopoPattern({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 opacity-[0.06] pointer-events-none text-muted-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 400 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Postmark circles */}
        <circle cx="80" cy="70" r="30" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="80" cy="70" r="24" stroke="currentColor" strokeWidth="0.5" />
        <line x1="50" y1="70" x2="110" y2="70" stroke="currentColor" strokeWidth="0.5" />

        <circle cx="300" cy="200" r="35" stroke="currentColor" strokeWidth="1.5" transform="rotate(-12 300 200)" />
        <circle cx="300" cy="200" r="28" stroke="currentColor" strokeWidth="0.5" transform="rotate(-12 300 200)" />
        <line x1="265" y1="200" x2="335" y2="200" stroke="currentColor" strokeWidth="0.5" transform="rotate(-12 300 200)" />

        {/* Stamp perforations */}
        <g transform="translate(200, 40)">
          <rect x="0" y="0" width="50" height="40" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" rx="2" />
        </g>

        <g transform="translate(50, 200) rotate(-8)">
          <rect x="0" y="0" width="45" height="35" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" rx="2" />
        </g>

        {/* Wavy cancellation lines */}
        <path
          d="M150 130 Q165 120, 180 130 Q195 140, 210 130 Q225 120, 240 130 Q255 140, 270 130"
          stroke="currentColor"
          strokeWidth="0.8"
        />
        <path
          d="M150 136 Q165 126, 180 136 Q195 146, 210 136 Q225 126, 240 136 Q255 146, 270 136"
          stroke="currentColor"
          strokeWidth="0.8"
        />

        {/* Small compass rose */}
        <g transform="translate(340, 80)">
          <line x1="0" y1="-12" x2="0" y2="12" stroke="currentColor" strokeWidth="1" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="currentColor" strokeWidth="1" />
          <line x1="-8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth="0.5" />
          <line x1="8" y1="-8" x2="-8" y2="8" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="3" stroke="currentColor" strokeWidth="0.8" />
        </g>
      </svg>
    </div>
  );
}
