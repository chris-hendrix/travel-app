"use client";

import { format } from "date-fns";
import { Receipt, Handshake, UserCircle } from "lucide-react";
import type { Payment } from "@journiful/shared/types";

interface PaymentItemProps {
  payment: Payment;
  onClick?: (payment: Payment) => void;
  currentUserId?: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentItem({ payment, onClick, currentUserId }: PaymentItemProps) {
  const isCurrentUserPayer =
    !!currentUserId && !payment.payerIsGuest && payment.userId === currentUserId;
  const payerName = isCurrentUserPayer ? "You" : (payment.payerName ?? "Someone");
  const isGuest = payment.payerIsGuest ?? false;
  const participantCount = payment.participants.length;
  const date = new Date(payment.date);
  const isSettlement =
    participantCount === 1 && payment.description.startsWith("Settled up");

  const highlightClass = "border-border";

  // Settlement card — different style
  if (isSettlement) {
    const recipient = payment.participants[0];
    const isRecipientCurrentUser =
      !!currentUserId && !recipient?.isGuest && recipient?.userId === currentUserId;
    const recipientName = isRecipientCurrentUser ? "you" : (recipient?.name ?? "Someone");
    return (
      <button
        onClick={onClick ? () => onClick(payment) : undefined}
        className="flex items-center gap-2 px-1 py-1.5 w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Handshake className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {payerName} paid {recipientName} {formatCents(payment.amount)}
        </span>
        <span className="shrink-0">&middot; {format(date, "MMM d")}</span>
      </button>
    );
  }

  // Regular expense card
  const verb = payerName === "You" ? "paid" : "paid";
  return (
    <button
      onClick={onClick ? () => onClick(payment) : undefined}
      className={`flex items-center gap-3 rounded-md bg-card linen-texture border p-3 w-full text-left hover:bg-accent/50 transition-colors cursor-pointer ${highlightClass}`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
        <Receipt className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium truncate">{payment.description}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">
            {payerName} {verb}
          </span>
          {isGuest && (
            <UserCircle className="h-3 w-3 shrink-0" aria-label="Guest" />
          )}
          <span className="shrink-0">
            {" "}&middot; {participantCount} {participantCount === 1 ? "person" : "people"}
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold">{formatCents(payment.amount)}</p>
        <p className="text-xs text-muted-foreground">
          {format(date, "MMM d")}
        </p>
      </div>
    </button>
  );
}
