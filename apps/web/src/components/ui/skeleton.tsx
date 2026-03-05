import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-muted rounded-md relative overflow-hidden",
        "after:absolute after:inset-0 after:animate-[shimmer_2s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent after:-translate-x-full",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
