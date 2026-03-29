"use client";

import { ArrowRight, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BalanceEntry } from "@journiful/shared/types";

interface BalanceItemProps {
  entry: BalanceEntry;
  onSettleUp?: (entry: BalanceEntry) => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function BalanceItem({ entry, onSettleUp }: BalanceItemProps) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-card linen-texture border border-border p-3">
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

      {(entry.from.isGuest || entry.to.isGuest) ? (
        <span className="text-xs text-muted-foreground shrink-0 ml-1">
          settle outside app
        </span>
      ) : onSettleUp ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0 ml-1"
          onClick={() => onSettleUp(entry)}
        >
          Settle Up
        </Button>
      ) : null}
    </div>
  );
}
