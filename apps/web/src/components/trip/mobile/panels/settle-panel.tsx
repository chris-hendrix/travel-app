"use client";

import { useState } from "react";
import { BalanceList } from "@/components/settle/balance-list";
import { PaymentList } from "@/components/settle/payment-list";
import { PaymentForm } from "@/components/settle/payment-form";
import { GuestManager } from "@/components/settle/guest-manager";
import { cn } from "@/lib/utils";
import type { BalanceEntry, Payment } from "@journiful/shared/types";

const TABS = ["Expenses", "Balances", "Guests"] as const;
type Tab = (typeof TABS)[number];

interface SettlePanelProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
}

export function SettlePanel({ tripId, isOrganizer, disabled }: SettlePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Expenses");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [settlement, setSettlement] = useState<
    | {
        fromId: string;
        fromType: "user" | "guest";
        toId: string;
        toType: "user" | "guest";
      }
    | undefined
  >();

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="shrink-0 px-4 pt-4 pb-2">
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
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
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
      </div>

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
