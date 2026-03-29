"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { useTripDetail } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BalanceList } from "@/components/settle/balance-list";
import { PaymentList } from "@/components/settle/payment-list";
import { PaymentForm } from "@/components/settle/payment-form";
import { GuestManager } from "@/components/settle/guest-manager";
import type { BalanceEntry, Payment } from "@journiful/shared/types";

interface SettleContentProps {
  tripId: string;
}

export function SettleContent({ tripId }: SettleContentProps) {
  const { data: trip } = useTripDetail(tripId);
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/trips/${tripId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold font-playfair truncate">
              Settle
            </h1>
            {trip && (
              <p className="text-xs text-muted-foreground truncate">
                {trip.name}
              </p>
            )}
          </div>
          <Button
            variant="gradient"
            size="sm"
            className="h-8 shrink-0"
            onClick={handleAddExpense}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
        {/* Balances */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            Balances
          </h2>
          <BalanceList tripId={tripId} onSettleUp={handleSettleUp} />
        </section>

        {/* Expenses */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            Expenses
          </h2>
          <PaymentList
            tripId={tripId}
            onPaymentClick={handleEditPayment}
            onAddExpense={handleAddExpense}
          />
        </section>

        {/* Guests */}
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
      </div>

      {/* Payment form sheet */}
      <PaymentForm
        tripId={tripId}
        open={isFormOpen}
        onOpenChange={handleFormClose}
        {...(editingPayment ? { payment: editingPayment } : {})}
        {...(settlement ? { settlement } : {})}
      />
    </div>
  );
}
