"use client";

import { Wallet, RotateCcw, Plus } from "lucide-react";
import { usePayments, useRestorePayment } from "@/hooks/use-payments";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PaymentItem } from "./payment-item";
import type { Payment } from "@journiful/shared/types";

interface PaymentListProps {
  tripId: string;
  onPaymentClick?: (payment: Payment) => void;
  onAddExpense?: () => void;
  /** When true, show soft-deleted payments with restore option */
  isOrganizer?: boolean;
}

export function PaymentList({
  tripId,
  onPaymentClick,
  onAddExpense,
  isOrganizer,
}: PaymentListProps) {
  const { data: payments, isPending } = usePayments(tripId);
  const restorePayment = useRestorePayment();

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

  // Split active vs deleted
  const active = payments
    .filter((p) => !p.deletedAt)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const deleted = isOrganizer
    ? payments
        .filter((p) => !!p.deletedAt)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  return (
    <div className="space-y-2">
      {active.map((payment) => (
        <PaymentItem
          key={payment.id}
          payment={payment}
          {...(onPaymentClick ? { onClick: onPaymentClick } : {})}
        />
      ))}

      {onAddExpense && (
        <Button
          variant="outline"
          className="w-full mt-1"
          onClick={onAddExpense}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      )}

      {deleted.length > 0 && (
        <div className="pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Deleted
          </p>
          {deleted.map((payment) => (
            <div key={payment.id} className="relative opacity-60">
              <PaymentItem payment={payment} />
              <div className="absolute inset-y-0 right-2 flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => restorePayment.mutate(payment.id)}
                  disabled={restorePayment.isPending}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
