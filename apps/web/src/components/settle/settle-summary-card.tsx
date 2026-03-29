"use client";

import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { myBalanceQueryOptions } from "@/hooks/balance-queries";
import { Skeleton } from "@/components/ui/skeleton";

interface SettleSummaryCardProps {
  tripId: string;
  /** When provided, scrolls to the settle section instead of navigating */
  onNavigateToSettle?: () => void;
}

function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function SettleSummaryCard({
  tripId,
  onNavigateToSettle,
}: SettleSummaryCardProps) {
  const { data, isPending } = useQuery({
    ...myBalanceQueryOptions(tripId),
    enabled: !!tripId,
  });

  if (isPending) {
    return (
      <div className="bg-card linen-texture border border-border rounded-md p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
    );
  }

  const netBalance = data?.netBalance ?? 0;

  let label: string;
  let sublabel: string;
  let colorClass: string;

  if (netBalance === 0) {
    label = "All settled up!";
    sublabel = "No outstanding balances";
    colorClass = "text-muted-foreground";
  } else if (netBalance > 0) {
    label = `You're owed ${formatCents(netBalance)}`;
    sublabel = "Tap to see details";
    colorClass = "text-green-600 dark:text-green-400";
  } else {
    label = `You owe ${formatCents(netBalance)}`;
    sublabel = "Tap to settle up";
    colorClass = "text-orange-600 dark:text-orange-400";
  }

  const content = (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
        <DollarSign className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${colorClass}`}>{label}</p>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );

  const cardClass =
    "bg-card linen-texture border border-border rounded-md p-4 hover:bg-accent/50 transition-colors block w-full text-left";

  if (onNavigateToSettle) {
    return (
      <button onClick={onNavigateToSettle} className={`${cardClass} cursor-pointer`}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/trips/${tripId}/settle`} className={cardClass}>
      {content}
    </Link>
  );
}
