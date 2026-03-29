"use client";

import { useState } from "react";
import { BalanceList } from "./balance-list";
import { PaymentList } from "./payment-list";
import { PaymentForm } from "./payment-form";
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
    <div className="space-y-4">
      {/* Header + tab bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold font-playfair">Settle</h2>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab}
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
        <GuestManager tripId={tripId} />
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
