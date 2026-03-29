"use client";

import { ArrowRight, UserCircle } from "lucide-react";
import type { BalanceEntry } from "@journiful/shared/types";

interface BalanceItemProps {
  entry: BalanceEntry;
  onSettleUp?: (entry: BalanceEntry) => void;
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
  currentUserId,
}: BalanceItemProps) {
  const fromName = personName(entry.from, currentUserId);
  const toName = personName(entry.to, currentUserId);
  const verb = fromName === "You" ? "owe" : "owes";

  // Only highlight when the current user owes someone (actionable)
  const youOwe = fromName === "You";

  const Wrapper = onSettleUp ? "button" : "div";

  return (
    <Wrapper
      {...(onSettleUp ? { onClick: () => onSettleUp(entry) } : {})}
      className={`group flex items-center gap-3 rounded-md bg-card linen-texture border p-3 w-full text-left transition-colors ${
        youOwe
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border"
      } ${onSettleUp ? "hover:bg-accent/50 cursor-pointer" : ""}`}
    >
      {/* Arrow icon — matches payment-item's icon circle pattern */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
        <ArrowRight className="h-4 w-4 text-primary" />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {fromName} {verb} {toName}
          {entry.from.isGuest && (
            <UserCircle className="inline h-3.5 w-3.5 text-muted-foreground ml-1 align-text-bottom" aria-label="Guest" />
          )}
          {entry.to.isGuest && (
            <UserCircle className="inline h-3.5 w-3.5 text-muted-foreground ml-1 align-text-bottom" aria-label="Guest" />
          )}
        </p>
        {onSettleUp && (
          <p className="text-xs text-primary group-hover:underline">
            Settle up
          </p>
        )}
      </div>

      {/* Amount */}
      <span className="text-sm font-semibold shrink-0">
        {formatCents(entry.amount)}
      </span>
    </Wrapper>
  );
}
