"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { BalanceList } from "@/components/settle/balance-list";
import { PaymentList } from "@/components/settle/payment-list";
import { PaymentForm } from "@/components/settle/payment-form";
import { SettlementForm } from "@/components/settle/settlement-form";
import { Button } from "@/components/ui/button";
import type { BalanceEntry, Payment } from "@journiful/shared/types";

interface SettlePanelProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
  hideFab?: boolean;
}

export function SettlePanel({ tripId, isOrganizer, disabled, hideFab }: SettlePanelProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const mounted = useMounted();
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Section heading */}
      <h2 className="text-xl font-semibold font-playfair shrink-0 px-4 pt-4">Settle</h2>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-20 pt-4 space-y-6">
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
      </div>

      {/* FAB — portaled to body like other panel FABs */}
      {!disabled &&
        mounted &&
        createPortal(
          <Button
            variant="gradient"
            size="icon"
            className={`fixed bottom-20 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 ease-out ${
              hideFab
                ? "opacity-0 scale-75 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
            onClick={handleAddExpense}
            aria-label="Add expense"
            tabIndex={hideFab ? -1 : undefined}
          >
            <Plus className="h-6 w-6" />
          </Button>,
          document.body,
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
