"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BalanceList } from "./balance-list";
import { PaymentList } from "./payment-list";
import { PaymentForm } from "./payment-form";
import { GuestManager } from "./guest-manager";
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
  const [settlement, setSettlement] = useState<{
    fromId: string;
    fromType: "user" | "guest";
    toId: string;
    toType: "user" | "guest";
  } | undefined>();

  const handleAddExpense = () => {
    setEditingPayment(undefined);
    setSettlement(undefined);
    setIsFormOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setSettlement(undefined);
    setIsFormOpen(true);
  };

  const handleSettleUp = (entry: BalanceEntry) => {
    setEditingPayment(undefined);
    setSettlement({
      fromId: entry.from.id,
      fromType: entry.from.isGuest ? "guest" : "user",
      toId: entry.to.id,
      toType: entry.to.isGuest ? "guest" : "user",
    });
    setIsFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingPayment(undefined);
      setSettlement(undefined);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold font-playfair">Settle</h2>
        {!disabled && (
          <Button
            variant="gradient"
            size="sm"
            onClick={handleAddExpense}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Expense
          </Button>
        )}
      </div>

      {/* Balances */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Balances
        </h3>
        <BalanceList
          tripId={tripId}
          {...(disabled ? {} : { onSettleUp: handleSettleUp })}
        />
      </section>

      {/* Expenses */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Expenses
        </h3>
        <PaymentList
          tripId={tripId}
          {...(disabled ? {} : { onPaymentClick: handleEditPayment, onAddExpense: handleAddExpense })}
          {...(isOrganizer ? { isOrganizer } : {})}
        />
      </section>

      {/* Guests */}
      {!disabled && (
        <CollapsibleSection
          label={
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Guests
            </span>
          }
        >
          <GuestManager tripId={tripId} />
        </CollapsibleSection>
      )}

      {/* Payment form sheet */}
      {!disabled && (
        <PaymentForm
          tripId={tripId}
          open={isFormOpen}
          onOpenChange={handleFormClose}
          {...(editingPayment ? { payment: editingPayment } : {})}
          {...(settlement ? { settlement } : {})}
        />
      )}
    </div>
  );
}
