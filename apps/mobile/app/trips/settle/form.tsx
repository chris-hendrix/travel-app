import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ExpenseDialog, type ExpenseInput } from "@/components/trip/ExpenseDialog";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { QuietAction } from "@/components/ui/QuietAction";
import { useDismiss } from "@/hooks/useDismiss";
import { useAuth } from "@/lib/authStore";
import { formatCents } from "@/lib/money";
import { viewerOf } from "@/lib/members";
import { paymentDay } from "@/lib/payments";
import { useBalances } from "@/lib/queries/balances";
import { toErrorCopy } from "@/lib/queries/errors";
import { useMembers } from "@/lib/queries/members";
import {
  useCreatePayment,
  useDeletePayment,
  usePayments,
  useUpdatePayment,
} from "@/lib/queries/payments";
import { todayIn, zoneOffsetMinutes } from "@/lib/timezone";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useTrip } from "@/lib/tripsStore";
import NotFound from "@/app/+not-found";

/**
 * The expense form, in its three modes:
 *
 * - `?id=X` — a new expense, added by any member.
 * - `?id=X&payment=Y` — the row being edited, or deleted from.
 * - `?id=X&settle=1&from=A&to=B` — one debt of the ledger's, recorded as
 *   paid.
 *
 * All three are the same fields over the same row, so all three are
 * `ExpenseDialog`; this file is the trip it belongs to, the mode, and
 * where the answer goes. The mode is read from the params, never from a
 * piece of state, because the route *is* the mode: a deep link, a
 * notification or a reload lands on the same form it was opened as.
 *
 * **The day is stamped in the zone the display clock names**, exactly as
 * the stay form computes it (`app/trips/stay/new.tsx:46-53`): a day-only
 * value is stamped in the zone it will be read in, and the ledger reads it
 * back with the same value (`paymentDay`). The form shows a day and no
 * clock, so it registers **no** display zone — a zone token would name a
 * clock that is not on this screen (the ledger's own call).
 *
 * **The row and the move are read through their section hooks**, never
 * through `queryClient.getQueryData`: the cache is where a row that was
 * deleted on another phone still sits, and a form painted out of it would
 * be a form over a row nobody has confirmed is there. So the reads are
 * asked for, and each one is asked for **only in the mode that needs
 * it** — a new expense should not fetch the ledger to fill itself in.
 */
export default function ExpenseForm() {
  return (
    <TripGate label="Loading the expense">
      <ExpenseFormScreen />
    </TripGate>
  );
}

/** The description a settlement is recorded under. */
const SETTLED_UP = "Settled up";

function ExpenseFormScreen() {
  const {
    id,
    payment: paymentParam,
    settle,
    from,
    to,
  } = useLocalSearchParams<{
    id?: string;
    payment?: string;
    settle?: string;
    from?: string;
    to?: string;
  }>();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { for: settingsFor } = useTripSettings();
  // The roster is the pickers' own read; it suspends under the gate, so
  // every member row is here before the first field is drawn.
  const { members } = useMembers(trip?.id);
  const { user } = useAuth();
  const viewer = viewerOf(members, user?.id);

  // Read before the guards: a hook called after a return is a hook called
  // a different number of times.
  const { clock } = trip ? settingsFor(trip) : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;

  const settleMode = settle === "1";
  const paymentId =
    typeof paymentParam === "string" && paymentParam.length > 0
      ? paymentParam
      : null;
  const editMode = !settleMode && paymentId !== null;
  const fromId = typeof from === "string" && from.length > 0 ? from : null;
  const toId = typeof to === "string" && to.length > 0 ? to : null;

  const expenses = usePayments(editMode ? trip?.id : undefined);
  const debts = useBalances(settleMode ? trip?.id : undefined);

  // A settled read is what makes "not here" a fact rather than a guess:
  // while the list is still loading the row may simply not have arrived.
  // Undeleted as well as present, because a delete paints `deletedAt`
  // optimistically and the row stays in the list until the refetch lands
  // (`useDeletePayment`) — the ledger filters on the same mark, and this is
  // what makes a form over a just-deleted row impossible rather than
  // brief.
  const row =
    editMode && expenses.status === "success"
      ? (expenses.payments.find(
          (payment) => payment.id === paymentId && payment.deletedAt === null,
        ) ?? null)
      : null;
  // The amount is the **move's**, never the URL's: a stale number in a
  // link is a lie about what is owed, and the ledger is what actually
  // knows.
  const move =
    settleMode && debts.status === "success" && fromId && toId
      ? (debts.balances.find(
          (entry) => entry.from.id === fromId && entry.to.id === toId,
        ) ?? null)
      : null;

  const create = useCreatePayment(trip?.id ?? "");
  const update = useUpdatePayment(trip?.id ?? "");
  const remove = useDeletePayment(trip?.id ?? "");
  const pending = create.isPending || update.isPending || remove.isPending;
  // The last write's failure, fed to the dialog's InlineError. The dialog
  // stays open on failure: dismissing would pretend it saved.
  const [serverError, setServerError] = useState<string | null>(null);

  if (!trip) {
    return <NotFound />;
  }

  const ledgerHref = `/trips/settle?id=${trip.id}`;
  const detailHref = `/trips/settle/detail?id=${trip.id}&payment=${paymentId ?? ""}`;
  const rowId = row?.id ?? null;

  const spent = (error: unknown, fallback: string) =>
    setServerError(toErrorCopy(error).message ?? fallback);

  // The mode's title and its one verb. The verb is the mode's, never the
  // row's: an edit saves, a settlement records what was owed, and a new
  // expense adds one more to the ledger.
  const title = settleMode ? "Settle up" : editMode ? "Edit expense" : "Add expense";
  const primaryTitle = settleMode
    ? pending
      ? "Recording payment"
      : "Record payment"
    : editMode
      ? pending
        ? "Saving changes"
        : "Save changes"
      : pending
        ? "Adding expense"
        : "Add expense";

  // Edit: the list has to have answered before "not here" can be said.
  // Until then the dialog says what it is waiting for, rather than
  // painting a blank form over a row that may be about to arrive.
  if (editMode) {
    if (expenses.status === "loading") {
      return (
        <FullscreenDialog title={title} dismissHref={detailHref}>
          <LoadingBlock label="Loading the expense" />
        </FullscreenDialog>
      );
    }
    if (expenses.status === "offline") {
      return (
        <FullscreenDialog title={title} dismissHref={detailHref}>
          <OfflineBlock onRetry={expenses.retry} />
        </FullscreenDialog>
      );
    }
    if (expenses.status === "error") {
      return (
        <FullscreenDialog title={title} dismissHref={detailHref}>
          <InlineError
            message="Couldn't load the expense"
            onRetry={expenses.retry}
          />
        </FullscreenDialog>
      );
    }
    if (!row) {
      return (
        <GoneDialog
          title={title}
          message="That expense is not here any more."
          dismissHref={ledgerHref}
          onDone={dismiss}
        />
      );
    }
  }

  // Settle-up: the same, over the ledger's moves rather than its rows.
  if (settleMode) {
    if (debts.status === "loading") {
      return (
        <FullscreenDialog title={title} dismissHref={ledgerHref}>
          <LoadingBlock label="Loading the debt" />
        </FullscreenDialog>
      );
    }
    if (debts.status === "offline") {
      return (
        <FullscreenDialog title={title} dismissHref={ledgerHref}>
          <OfflineBlock onRetry={debts.retry} />
        </FullscreenDialog>
      );
    }
    if (debts.status === "error") {
      return (
        <FullscreenDialog title={title} dismissHref={ledgerHref}>
          <InlineError
            message="Couldn't load the debt"
            onRetry={debts.retry}
          />
        </FullscreenDialog>
      );
    }
    if (!move || !fromId || !toId) {
      return (
        <GoneDialog
          title={title}
          message="Nothing is owed between these two any more."
          dismissHref={ledgerHref}
          onDone={dismiss}
          onLedger={dismiss}
        />
      );
    }
  }

  const initial: Partial<ExpenseInput> =
    editMode && row
      ? {
          description: row.description,
          amount: formatCents(row.amount),
          // `null` on the wire is an empty field here: the update schema
          // refuses an explicit null and clears on `""`, so the round trip
          // is null in, "" out (`lib/queries/payments.ts`).
          note: row.note ?? "",
          payerMemberId: row.payerMemberId,
          participantIds: row.participants.map(
            (participant) => participant.memberId,
          ),
          day: paymentDay(row, timeZone),
        }
      : settleMode && move && fromId && toId
        ? {
            description: SETTLED_UP,
            amount: formatCents(move.amount),
            note: "",
            // The debtor pays the creditor: `move.from` is who owes, and a
            // payment credits its payer and debits its participants
            // (`balance.service.ts`), so this is the row that cancels the
            // debt rather than doubling it.
            payerMemberId: fromId,
            participantIds: [toId],
            day: todayIn(timeZone),
          }
        : { day: todayIn(timeZone) };

  return (
    <ExpenseDialog
      title={title}
      primaryTitle={primaryTitle}
      members={members}
      viewerMemberId={viewer?.id ?? null}
      isOrganizer={viewer?.isOrganizer ?? false}
      dismissHref={editMode ? detailHref : ledgerHref}
      initial={initial}
      lockedParticipantId={settleMode ? toId : null}
      onAddGuest={() => router.push(`/trips/members/new?id=${trip.id}`)}
      serverError={serverError}
      pending={pending}
      onDelete={
        editMode && rowId
          ? () => {
              // Deleting is soft on the server and needs no confirmation.
              // A failed delete stays on the form with the failure instead
              // of leaving, so the row is still there to try again on.
              setServerError(null);
              remove.mutate(
                { paymentId: rowId },
                {
                  onSuccess: () => dismiss(),
                  onError: (error: unknown) =>
                    spent(error, "Couldn't delete the expense."),
                },
              );
            }
          : undefined
      }
      onSubmit={(input, cents) => {
        const payerMemberId = input.payerMemberId;
        // Validation ran in the dialog; this is the type's guard, not a
        // second rule.
        if (!payerMemberId) return;

        const payload = {
          description: input.description.trim(),
          amount: cents,
          payerMemberId,
          // The picker's own order, which is the order the shares above it
          // were previewed in: the server hands the remainder cent to the
          // first participant it receives (`splitPreview` mirrors that).
          participants: input.participantIds.map((memberId) => ({ memberId })),
          date: stampDay(input.day, timeZone),
          // An emptied note is the clearing value rather than an omission:
          // the create side drops an empty one on the way out and the
          // update side stores `""` as null (`lib/queries/payments.ts`).
          note: input.note,
        };

        setServerError(null);
        if (editMode && rowId) {
          update.mutate(
            { paymentId: rowId, input: payload },
            {
              onSuccess: () => dismiss(),
              onError: (error: unknown) =>
                spent(error, "Couldn't save the expense."),
            },
          );
        } else {
          create.mutate(payload, {
            onSuccess: () => dismiss(),
            onError: (error: unknown) =>
              spent(error, "Couldn't save the expense."),
          });
        }
      }}
    />
  );
}

/**
 * A day the API will read back as that same day, anywhere.
 *
 * `lib/newStay.ts`'s `stamp` rule with the clock fixed at noon: the offset
 * is taken from the zone the day was read in, at noon on the day itself,
 * so the instant is the middle of that day rather than an edge of it. Noon
 * because the ledger reads the day back in the same zone (`paymentDay`)
 * and a midnight would be the day before for anybody far enough east.
 */
function stampDay(day: string, timeZone: string | null): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const offsetMinutes = zoneOffsetMinutes(timeZone, `${day}T12:00:00.000Z`);

  return new Date(
    Date.UTC(year, month - 1, date, 12, 0) - offsetMinutes * 60_000,
  ).toISOString();
}

/**
 * What the form says when the thing it was opened for is gone: the row
 * was deleted, or the debt was settled from another surface. A sentence
 * and a way out, never a blank form — a form with nothing in it looks
 * like an invitation to type a new expense at whatever address the link
 * happened to name.
 *
 * `onLedger` is the settle-up mode's second door: the ledger is where the
 * moves are, and a reader whose move has gone wants it, not the sheet they
 * came through.
 */
function GoneDialog({
  title,
  message,
  dismissHref,
  onDone,
  onLedger,
}: {
  title: string;
  message: string;
  dismissHref: string;
  onDone: () => void;
  onLedger?: (() => void) | undefined;
}) {
  return (
    <FullscreenDialog
      title={title}
      primaryTitle="Done"
      onPrimary={onDone}
      dismissHref={dismissHref}
    >
      <Text className="font-body text-base text-ink">{message}</Text>
      {onLedger ? <QuietAction label="Back to the ledger" onPress={onLedger} /> : null}
    </FullscreenDialog>
  );
}
