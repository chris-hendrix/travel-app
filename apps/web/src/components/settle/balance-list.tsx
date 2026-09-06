"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/app/providers/auth-provider";
import { tripBalancesQueryOptions } from "@/hooks/balance-queries";
import { membersQueryOptions } from "@/hooks/invitation-queries";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceItem } from "./balance-item";
import type { BalanceEntry } from "@journiful/shared/types";

interface BalanceListProps {
  tripId: string;
  onSettleUp?: (entry: BalanceEntry) => void;
}

export function BalanceList({ tripId, onSettleUp }: BalanceListProps) {
  const { user } = useAuth();
  const { data: balances, isPending } = useQuery({
    ...tripBalancesQueryOptions(tripId),
    enabled: !!tripId,
  });

  const { data: members } = useQuery({
    ...membersQueryOptions(tripId),
    enabled: !!tripId,
  });

  // Null-safe current-member lookup (guests have userId null, never match).
  const currentMember = user?.id
    ? members?.find((m) => m.userId === user.id)
    : undefined;

  // Sort: current member's balances first (member-keyed comparison).
  const sorted = useMemo(() => {
    if (!balances || !currentMember) return balances;
    return [...balances].sort((a, b) => {
      const aIsMe =
        a.from.id === currentMember.id || a.to.id === currentMember.id;
      const bIsMe =
        b.from.id === currentMember.id || b.to.id === currentMember.id;
      if (aIsMe && !bIsMe) return -1;
      if (!aIsMe && bIsMe) return 1;
      return 0;
    });
  }, [balances, currentMember]);

  if (isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!sorted || sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-card linen-texture border border-border p-4 text-center justify-center">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="text-sm font-medium text-success">
          All settled up!
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((entry, i) => (
        <BalanceItem
          key={i}
          entry={entry}
                    // Balance person ids are member ids — pass the viewer's member id
          // so "You" labels resolve (guests never match).
          {...(currentMember ? { currentUserId: currentMember.id } : {})}
          {...(onSettleUp ? { onSettleUp } : {})}
        />
      ))}
    </div>
  );
}
