import { cn } from "@/lib/utils";

interface PostmarkStampProps {
  date?: string | undefined;
  city?: string | undefined;
  className?: string | undefined;
  size?: "sm" | "md" | "lg" | undefined;
}

export function PostmarkStamp({
  date,
  city,
  className,
  size = "md",
}: PostmarkStampProps) {
  const sizeMap = {
    sm: { outer: 48, stroke: 1.5, fontSize: 5, lineGap: 6 },
    md: { outer: 72, stroke: 2, fontSize: 7, lineGap: 8 },
    lg: { outer: 96, stroke: 2, fontSize: 9, lineGap: 10 },
  };
  const s = sizeMap[size];
  const cx = s.outer / 2;
  const cy = s.outer / 2;
  const r = cx - 4;

  return (
    <svg
      width={s.outer}
      height={s.outer}
      viewBox={`0 0 ${s.outer} ${s.outer}`}
      className={cn("text-foreground opacity-35", className)}
      style={{ transform: "rotate(-15deg)" }}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={s.stroke}
      />
      {/* Inner circle */}
      <circle
        cx={cx}
        cy={cy}
        r={r - 3}
        fill="none"
        stroke="currentColor"
        strokeWidth={s.stroke * 0.6}
      />

      {/* Cancellation lines extending past circle */}
      {[-s.lineGap, 0, s.lineGap].map((offset) => (
        <line
          key={offset}
          x1={0}
          y1={cy + offset}
          x2={s.outer}
          y2={cy + offset}
          stroke="currentColor"
          strokeWidth={s.stroke * 0.8}
        />
      ))}

      {/* City text — top arc */}
      {city && (
        <>
          <defs>
            <path
              id={`city-arc-${size}`}
              d={`M ${cx - r + 8} ${cy} A ${r - 8} ${r - 8} 0 0 1 ${cx + r - 8} ${cy}`}
            />
          </defs>
          <text
            fill="currentColor"
            fontSize={s.fontSize}
            fontFamily="var(--font-typewriter), monospace"
            textAnchor="middle"
            letterSpacing="0.12em"
          >
            <textPath href={`#city-arc-${size}`} startOffset="50%">
              {city.toUpperCase()}
            </textPath>
          </text>
        </>
      )}

      {/* Date text — bottom arc */}
      {date && (
        <>
          <defs>
            <path
              id={`date-arc-${size}`}
              d={`M ${cx - r + 8} ${cy} A ${r - 8} ${r - 8} 0 0 0 ${cx + r - 8} ${cy}`}
            />
          </defs>
          <text
            fill="currentColor"
            fontSize={s.fontSize}
            fontFamily="var(--font-typewriter), monospace"
            textAnchor="middle"
            letterSpacing="0.1em"
          >
            <textPath href={`#date-arc-${size}`} startOffset="50%">
              {date.toUpperCase()}
            </textPath>
          </text>
        </>
      )}
    </svg>
  );
}
