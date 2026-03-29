"use client";

import { useState } from "react";
import { BalanceList } from "./balance-list";
import { PaymentList } from "./payment-list";
import { PaymentForm } from "./payment-form";
import { SettlementForm } from "./settlement-form";
import { GuestManager } from "./guest-manager";
import { cn } from "@/lib/utils";
import type { BalanceEntry, Payment } from "@journiful/shared/types";

const TABS = ["Expenses", "Balances", "Guests"] as const;
type Tab = (typeof TABS)[number];

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
  const [activeTab, setActiveTab] = useState<Tab>("Expenses");
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
    <div className="space-y-4">
      <h2 className="text-xl font-semibold font-playfair">Settle</h2>

      {/* Underlined tabs */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer",
              activeTab === tab
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Expenses" && (
        <PaymentList
          tripId={tripId}
          {...(disabled ? {} : { onPaymentClick: handleEditPayment, onAddExpense: handleAddExpense })}
          {...(isOrganizer ? { isOrganizer } : {})}
        />
      )}

      {activeTab === "Balances" && (
        <BalanceList
          tripId={tripId}
          {...(disabled ? {} : { onSettleUp: handleSettleUp })}
        />
      )}

      {activeTab === "Guests" && (
        <GuestManager tripId={tripId} {...(disabled ? { disabled } : {})} />
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
