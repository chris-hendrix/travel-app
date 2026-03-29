"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold font-playfair">Settle</h2>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer",
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            {tab}
          </button>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={handleAddExpense}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground ml-auto"
          >
            <Plus className="h-3 w-3" />
            Add Expense
          </button>
        )}
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
        <GuestManager tripId={tripId} />
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
