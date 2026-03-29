"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { tripBalancesQueryOptions } from "@/hooks/balance-queries";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceItem } from "./balance-item";
import type { BalanceEntry } from "@journiful/shared/types";

interface BalanceListProps {
  tripId: string;
  onSettleUp?: (entry: BalanceEntry) => void;
}

export function BalanceList({ tripId, onSettleUp }: BalanceListProps) {
  const { data: balances, isPending } = useQuery({
    ...tripBalancesQueryOptions(tripId),
    enabled: !!tripId,
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!balances || balances.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-card linen-texture border border-border p-4 text-center justify-center">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-green-600 dark:text-green-400">
          All settled up!
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {balances.map((entry, i) => (
        <BalanceItem key={i} entry={entry} {...(onSettleUp ? { onSettleUp } : {})} />
      ))}
    </div>
  );
}
