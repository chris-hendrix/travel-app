"use client";

import { ArrowRight, UserCircle } from "lucide-react";
import type { BalanceEntry } from "@journiful/shared/types";

interface BalanceItemProps {
  entry: BalanceEntry;
  onSettleUp?: (entry: BalanceEntry) => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function BalanceItem({ entry, onSettleUp }: BalanceItemProps) {
  const Wrapper = onSettleUp ? "button" : "div";

  return (
    <Wrapper
      {...(onSettleUp ? { onClick: () => onSettleUp(entry) } : {})}
      className={`flex items-center gap-2 rounded-md bg-card linen-texture border border-border p-3 w-full text-left ${
        onSettleUp ? "hover:bg-accent/50 transition-colors cursor-pointer" : ""
      }`}
    >
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span className="text-sm font-medium truncate">{entry.from.name}</span>
          {entry.from.isGuest && (
            <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Guest" />
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="text-sm font-semibold text-foreground">
            {formatCents(entry.amount)}
          </span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>

        <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
          <span className="text-sm font-medium truncate">{entry.to.name}</span>
          {entry.to.isGuest && (
            <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Guest" />
          )}
        </div>
      </div>

      {onSettleUp && (
        <span className="text-xs text-primary shrink-0 ml-1">
          Settle
        </span>
      )}
    </Wrapper>
  );
}
