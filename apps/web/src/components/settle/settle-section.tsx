"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { BalanceList } from "./balance-list";
import { PaymentList } from "./payment-list";
import { PaymentForm } from "./payment-form";
import { SettlementForm } from "./settlement-form";
import { Button } from "@/components/ui/button";
import type { BalanceEntry, Payment } from "@journiful/shared/types";

interface SettleSectionProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
}

export function SettleSection({
  tripId,
  isOrganizer,
  disabled,
}: SettleSectionProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [settleEntry, setSettleEntry] = useState<BalanceEntry | undefined>();

  const handleAddExpense = () => {
    setEditingPayment(undefined);
    setIsFormOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setIsFormOpen(true);
  };

  const handleSettleUp = (entry: BalanceEntry) => {
    setSettleEntry(entry);
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingPayment(undefined);
    }
  };

  return (
    <div className="space-y-6 relative pb-16">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold font-playfair">Settle</h2>
      </div>

      {/* Balances */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Balances</h3>
        <BalanceList
          tripId={tripId}
          {...(disabled ? {} : { onSettleUp: handleSettleUp })}
        />
      </div>

      {/* Expenses */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Expenses</h3>
        <PaymentList
          tripId={tripId}
          {...(disabled ? {} : { onPaymentClick: handleEditPayment })}
          {...(isOrganizer ? { isOrganizer } : {})}
        />
      </div>

      {/* FAB */}
      {!disabled && (
        <Button
          variant="gradient"
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg lg:absolute lg:bottom-0 lg:right-0"
          onClick={handleAddExpense}
          aria-label="Add expense"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      {/* Payment form sheet */}
      {!disabled && (
        <PaymentForm
          tripId={tripId}
          open={isFormOpen}
          onOpenChange={handleFormClose}
          {...(editingPayment ? { payment: editingPayment } : {})}
        />
      )}

      {/* Settlement form sheet */}
      {!disabled && settleEntry && (
        <SettlementForm
          tripId={tripId}
          open={!!settleEntry}
          onOpenChange={(open) => {
            if (!open) setSettleEntry(undefined);
          }}
          entry={settleEntry}
        />
      )}
    </div>
  );
}
