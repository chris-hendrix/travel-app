"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/app/providers/auth-provider";
import { membersQueryOptions } from "@/hooks/invitation-queries";
import {
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  getPaymentErrorMessage,
} from "@/hooks/use-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Payment } from "@journiful/shared/types";

interface PayerOption {
  id: string;
  name: string;
  /** Guests (userId === null) are selectable as payer AND participant. */
  isGuest: boolean;
}

interface ParticipantOption {
  id: string;
  name: string;
  isGuest: boolean;
  checked: boolean;
}

interface PaymentFormProps {
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: Payment;
}

export function PaymentForm({
  tripId,
  open,
  onOpenChange,
  payment,
}: PaymentFormProps) {
  const isEditing = !!payment;
  const { user } = useAuth();

  const { data: members } = useQuery({
    ...membersQueryOptions(tripId),
    enabled: !!tripId,
  });
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  // Build payer/participant options (trip members only, guests included).
  // One shared options array feeds both the payer Select and the
  // participant checkbox list. Guests are full counterparties; the only
  // visual distinction is the dashed-circle guest marker (echoes the
  // avatar ring). "You" logic never matches a guest (userId === null).
  const people = useMemo<PayerOption[]>(() => {
    if (!members) return [];
    return members.map((m) => ({
      id: m.id,
      name: m.displayName,
      isGuest: m.userId === null,
    }));
  }, [members]);

  const currentMember = useMemo(
    () => (user?.id ? members?.find((m) => m.userId === user.id) : undefined),
    [members, user?.id],
  );

  // Form state
  const [description, setDescription] = useState(
    payment?.description ?? "",
  );
  const [amountStr, setAmountStr] = useState(
    payment ? (payment.amount / 100).toFixed(2) : "",
  );
  const [payerId, setPayerId] = useState<string>(() => {
    if (payment) {
      return payment.payerMemberId ?? "";
    }
    return currentMember?.id ?? "";
  });
  const [date, setDate] = useState(
    payment
      ? format(new Date(payment.date), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
  );
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    () => {
      if (payment) {
        return new Set(payment.participants.map((p) => p.memberId));
      }
      // Default: all people selected
      return new Set(people.map((p) => p.id));
    },
  );

  // Reset form when payment prop changes (opening a different expense or creating new)
  useEffect(() => {
    if (open) {
      setDescription(payment?.description ?? "");
      setAmountStr(payment ? (payment.amount / 100).toFixed(2) : "");
      setPayerId(payment?.payerMemberId ?? currentMember?.id ?? "");
      setDate(
        payment
          ? format(new Date(payment.date), "yyyy-MM-dd")
          : format(new Date(), "yyyy-MM-dd"),
      );
      if (payment) {
        setSelectedParticipants(
          new Set(payment.participants.map((p) => p.memberId)),
        );
        setInitialized(true);
      } else {
        setSelectedParticipants(new Set(people.map((p) => p.id)));
        setInitialized(people.length > 0);
      }
    }
  }, [open, payment]);

  // When people list loads and we have no participants yet (initial add), select all
  const [initialized, setInitialized] = useState(!!payment);
  if (!initialized && people.length > 0 && selectedParticipants.size === 0) {
    setSelectedParticipants(new Set(people.map((p) => p.id)));
    setInitialized(true);
  }

  // Default the payer to the viewer's own member row once members load
  // (initial state runs before the query resolves; never a guest row).
  useEffect(() => {
    if (!payment && payerId === "" && currentMember) {
      setPayerId(currentMember.id);
    }
  }, [payment, payerId, currentMember]);

  const payerPerson = people.find((p) => p.id === payerId);

  const participantOptions = useMemo<ParticipantOption[]>(
    () =>
      people.map((p) => ({
        ...p,
        checked: selectedParticipants.has(p.id),
      })),
    [people, selectedParticipants],
  );

  const toggleParticipant = useCallback((id: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedParticipants(new Set(people.map((p) => p.id)));
  }, [people]);

  const selectNone = useCallback(() => {
    setSelectedParticipants(new Set());
  }, []);

  // Validation
  const amountCents = Math.round(parseFloat(amountStr || "0") * 100);
  const isValid =
    description.trim().length > 0 &&
    amountCents > 0 &&
    payerId !== "" &&
    selectedParticipants.size > 0;

  const handleSubmit = () => {
    if (!isValid) return;

    const payer = people.find((p) => p.id === payerId);
    if (!payer) return;

    const participants = Array.from(selectedParticipants).map((id) => ({
      memberId: id,
    }));

    const payload = {
      description: description.trim(),
      amount: amountCents,
      payerMemberId: payerId,
      participants,
      date: new Date(date + "T12:00:00").toISOString(),
    };

    if (isEditing && payment) {
      updatePayment.mutate(
        { paymentId: payment.id, data: payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createPayment.mutate(
        { tripId, data: payload },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  const handleDelete = () => {
    if (!payment) return;
    deletePayment.mutate(payment.id, {
      onSuccess: () => {
        toast.success("Expense deleted");
        onOpenChange(false);
      },
    });
  };

  const isPending = createPayment.isPending || updatePayment.isPending || deletePayment.isPending;
  const error =
    getPaymentErrorMessage(createPayment.error) ||
    getPaymentErrorMessage(updatePayment.error);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-2xl font-playfair tracking-tight">
            {isEditing ? "Edit Expense" : "Add Expense"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {isEditing
              ? "Edit an existing expense"
              : "Add a new expense to split with the group"}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-5">
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="payment-description">Description</Label>
              <Input
                id="payment-description"
                placeholder="What was it for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="payment-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Paid by */}
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select value={payerId} onValueChange={setPayerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select who paid" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-1.5">
                        {p.isGuest && (
                          <span
                            aria-hidden
                            className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-accent"
                          />
                        )}
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <DatePicker
                value={date}
                onChange={setDate}
                placeholder="When did it happen?"
              />
            </div>

            {/* Split with */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Split with</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-primary hover:underline"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-xs text-primary hover:underline"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border border-input p-2">
                {participantOptions.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={p.checked}
                      onCheckedChange={() => toggleParticipant(p.id)}
                    />
                    {p.isGuest && (
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-accent"
                      />
                    )}
                    <span className="text-sm">{p.name}</span>
                    {p.isGuest && (
                      <span className="text-xs text-muted-foreground">
                        guest
                      </span>
                    )}
                  </label>
                ))}
                {participantOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground px-2 py-1.5">
                    No members available.
                  </p>
                )}
              </div>
              {payerPerson && selectedParticipants.has(payerId) && (
                <p className="text-xs text-muted-foreground">
                  {payerPerson.name} is both paying and splitting — their net
                  cost will be reduced.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </SheetBody>

        <SheetFooter className="flex-col! gap-2">
          <Button
            variant="gradient"
            className="w-full h-12"
            disabled={!isValid || isPending}
            onClick={handleSubmit}
          >
            {isPending && !deletePayment.isPending
              ? isEditing
                ? "Saving..."
                : "Adding..."
              : isEditing
                ? "Save Changes"
                : "Add Expense"}
          </Button>
          {isEditing && (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isPending}
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deletePayment.isPending ? "Deleting..." : "Delete Expense"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
