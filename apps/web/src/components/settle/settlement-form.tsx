"use client";

import { useState } from "react";
import { Handshake } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { membersQueryOptions } from "@/hooks/invitation-queries";
import { useCreatePayment, getPaymentErrorMessage } from "@/hooks/use-payments";
import { VenmoIcon } from "@/components/icons/venmo-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BalanceEntry } from "@journiful/shared/types";

interface SettlementFormProps {
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: BalanceEntry;
}

const NOTE_SUGGESTIONS = ["Venmo", "Cash", "Zelle", "PayPal", "Apple Pay"];

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function SettlementForm({
  tripId,
  open,
  onOpenChange,
  entry,
}: SettlementFormProps) {
  const createPayment = useCreatePayment();
  const { data: members } = useQuery({
    ...membersQueryOptions(tripId),
    enabled: !!tripId,
  });

  const [amount, setAmount] = useState(formatCents(entry.amount));
  const [note, setNote] = useState("");

  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const isValid = amountCents > 0;

  // Determine payer and recipient from the balance entry
  // entry.from owes entry.to — so from is paying to
  const fromPerson = entry.from;
  const toPerson = entry.to;

  // Look up recipient's venmo handle from members data
  const recipientMember = !toPerson.isGuest
    ? members?.find((m) => m.userId === toPerson.id)
    : undefined;
  const venmoHandle = recipientMember?.handles?.venmo;

  const handleSubmit = () => {
    if (!isValid) return;

    const description = note.trim()
      ? `Settled up — ${note.trim()}`
      : "Settled up";

    createPayment.mutate(
      {
        tripId,
        data: {
          description,
          amount: amountCents,
          ...(fromPerson.isGuest
            ? { guestId: fromPerson.id }
            : { userId: fromPerson.id }),
          participants: [
            toPerson.isGuest
              ? { guestId: toPerson.id }
              : { userId: toPerson.id },
          ],
          date: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Settlement recorded");
          onOpenChange(false);
        },
      },
    );
  };

  const error = getPaymentErrorMessage(createPayment.error);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-2xl font-playfair tracking-tight">
            Settle Up
          </SheetTitle>
          <SheetDescription className="sr-only">
            Record a payment between two people
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-6">
            {/* Who is paying whom */}
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
              <div className="flex-1 text-center">
                <p className="text-sm text-muted-foreground">From</p>
                <p className="text-base font-semibold">{fromPerson.name}</p>
              </div>
              <Handshake className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 text-center">
                <p className="text-sm text-muted-foreground">To</p>
                <p className="text-base font-semibold">{toPerson.name}</p>
              </div>
            </div>

            {/* Venmo quick link */}
            {venmoHandle && (
              <a
                href={`https://venmo.com/${venmoHandle.replace(/^@/, "")}?txn=pay&amount=${formatCents(entry.amount)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg border border-border p-3 text-sm font-medium text-primary hover:bg-muted/50 transition-colors"
              >
                <VenmoIcon className="w-4 h-4" />
                Pay {toPerson.name} on Venmo
              </a>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="settlement-amount">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="settlement-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="settlement-note">Note (optional)</Label>
              <Input
                id="settlement-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paid on Venmo"
              />
              <div className="flex flex-wrap gap-1.5">
                {NOTE_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setNote(suggestion)}
                    className="px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button
            variant="gradient"
            className="w-full h-12"
            disabled={!isValid || createPayment.isPending}
            onClick={handleSubmit}
          >
            {createPayment.isPending ? "Recording..." : "Record Settlement"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
