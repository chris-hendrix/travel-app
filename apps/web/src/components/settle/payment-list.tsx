"use client";

import { Wallet } from "lucide-react";
import { usePayments } from "@/hooks/use-payments";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentItem } from "./payment-item";
import type { Payment } from "@journiful/shared/types";

interface PaymentListProps {
  tripId: string;
  onPaymentClick?: (payment: Payment) => void;
  onAddExpense?: () => void;
}

export function PaymentList({
  tripId,
  onPaymentClick,
  onAddExpense,
}: PaymentListProps) {
  const { data: payments, isPending } = usePayments(tripId);

  if (isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Nothing to settle yet"
        description="Add your first expense to start splitting costs."
        {...(onAddExpense ? { action: { label: "Add Expense", onClick: onAddExpense } } : {})}
      />
    );
  }

  // Sort by date descending
  const sorted = [...payments].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <div className="space-y-2">
      {sorted.map((payment) => (
        <PaymentItem
          key={payment.id}
          payment={payment}
          {...(onPaymentClick ? { onClick: onPaymentClick } : {})}
        />
      ))}
    </div>
  );
}
