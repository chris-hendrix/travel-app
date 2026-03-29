"use client";

import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BalanceEntry } from "@journiful/shared/types";

interface BalanceItemProps {
  entry: BalanceEntry;
  onSettleUp?: (entry: BalanceEntry) => void;
  highlighted?: boolean;
  currentUserId?: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function personName(
  person: BalanceEntry["from"],
  currentUserId?: string,
): string {
  if (currentUserId && !person.isGuest && person.id === currentUserId) {
    return "You";
  }
  return person.name;
}

export function BalanceItem({
  entry,
  onSettleUp,
  highlighted,
  currentUserId,
}: BalanceItemProps) {
  const fromName = personName(entry.from, currentUserId);
  const toName = personName(entry.to, currentUserId);

  // Build sentence: "You owe Bob $16.67" or "David owes Alice $16.67"
  const verb = fromName === "You" ? "owe" : "owes";
  const label = `${fromName} ${verb} ${toName}`;

  return (
    <div
      className={`flex items-center justify-between rounded-md bg-card linen-texture border p-3 ${
        highlighted
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-medium truncate">{label}</span>
        {entry.from.isGuest && (
          <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Guest" />
        )}
        {entry.to.isGuest && (
          <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Guest" />
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-3">
        <span className="text-sm font-semibold">
          {formatCents(entry.amount)}
        </span>
        {onSettleUp && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSettleUp(entry)}
          >
            Settle up
          </Button>
        )}
      </div>
    </div>
  );
}
