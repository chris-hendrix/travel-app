"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
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
  /** "tab" renders the desktop/standalone tab layout; "panel" renders the
   *  full-height mobile swiper panel layout. Defaults to "tab". */
  variant?: "tab" | "panel";
  /** Panel variant only: fade out the portaled FAB when the panel is not
   *  the active swiper slide. */
  hideFab?: boolean;
}

export function SettleSection({
  tripId,
  isOrganizer,
  disabled,
  variant = "tab",
  hideFab,
}: SettleSectionProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const mounted = useMounted();
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [settleEntry, setSettleEntry] = useState<BalanceEntry | undefined>();

  const isPanel = variant === "panel";

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

  const fab = !disabled && (
    <Button
      variant="gradient"
      size="icon"
      className={
        isPanel
          ? `fixed bottom-20 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 ease-out ${
              hideFab
                ? "opacity-0 scale-75 pointer-events-none"
                : "opacity-100 scale-100"
            }`
          : "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg lg:absolute lg:bottom-0 lg:right-0"
      }
      onClick={handleAddExpense}
      aria-label="Add expense"
      tabIndex={isPanel && hideFab ? -1 : undefined}
    >
      <Plus className="h-6 w-6" />
    </Button>
  );

  const balances = (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Balances</h3>
      <BalanceList
        tripId={tripId}
        {...(disabled ? {} : { onSettleUp: handleSettleUp })}
      />
    </div>
  );

  const expenses = (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Expenses</h3>
      <PaymentList
        tripId={tripId}
        {...(disabled ? {} : { onPaymentClick: handleEditPayment })}
        {...(isOrganizer ? { isOrganizer } : {})}
      />
    </div>
  );

  const forms = (
    <>
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
    </>
  );

  if (isPanel) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Section heading */}
        <h2 className="text-xl font-semibold font-playfair shrink-0 px-4 pt-4">
          Settle
        </h2>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-20 pt-4 space-y-6">
          {balances}
          {expenses}
        </div>

        {/* FAB — portaled to body like other panel FABs */}
        {fab && mounted && createPortal(fab, document.body)}

        {forms}
      </div>
    );
  }

  return (
    <div className="space-y-6 relative pb-16">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold font-playfair">Settle</h2>
      </div>

      {balances}
      {expenses}

      {/* FAB */}
      {fab}

      {forms}
    </div>
  );
}
