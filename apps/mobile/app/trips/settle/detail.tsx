import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ExpenseDetail } from "@/components/trip/ExpenseDetail";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { useDismiss, useDismissTo } from "@/hooks/useDismiss";
import { useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { usePayments } from "@/lib/queries/payments";
import { useMembers } from "@/lib/queries/members";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useTrip } from "@/lib/tripsStore";
import NotFound from "@/app/+not-found";

/**
 * One expense, opened from the ledger: the split, the payer and the note.
 *
 * The row is read through the payments section hook, never from
 * `queryClient.getQueryData` — the cache is where a row that was deleted on
 * another phone still sits, and this dialog is the one that says whether
 * there is still something to read. A settled read that does not carry the
 * row says so; a read that has not landed yet says what it is waiting for.
 *
 * **The one predicate, and the reason it is not symmetrical:**
 * `payment.createdBy` is a **user** id (`payments.created_by` references
 * `users.id`) while `viewerOf(members, user?.id)` hands back a `Member`
 * whose `id` is a **member** id. So an author is
 * `payment.createdBy === viewer.userId`, and "You" in the split is
 * `participant.memberId === viewer.id`. Comparing one to the other is
 * always a bug, which is why they are written in one place, next to each
 * other, like this.
 *
 * The day is read in the zone the display clock names and the ledger reads
 * it in (`paymentDay`), so it round-trips; the dialog shows days and no
 * clock, so it registers no display zone.
 */
export default function ExpenseDetailRoute() {
  return (
    <TripGate label="Loading the expense details">
      <ExpenseDetailScreen />
    </TripGate>
  );
}

function ExpenseDetailScreen() {
  const { id, payment: paymentParam } = useLocalSearchParams<{
    id?: string;
    payment?: string;
  }>();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { for: settingsFor } = useTripSettings();
  const { members } = useMembers(trip?.id);
  const { user } = useAuth();
  const viewer = viewerOf(members, user?.id);
  const expenses = usePayments(trip?.id);

  // Read before the guards: a hook called after a return is a hook called
  // a different number of times.
  const { clock } = trip ? settingsFor(trip) : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;

  const paymentId =
    typeof paymentParam === "string" && paymentParam.length > 0
      ? paymentParam
      : null;
  // Present or not: a delete removes the row (`useDeletePayment`), so there
  // is no mark to read past. The sentence below still has a job — a row
  // deleted on another phone, or a link to one that never existed.
  const row =
    expenses.status === "success"
      ? (expenses.payments.find((payment) => payment.id === paymentId) ?? null)
      : null;

  if (!trip) {
    return <NotFound />;
  }

  const ledgerHref = `/trips/settle?id=${trip.id}`;
  // A row that is gone leaves this sheet as the odd one out in the stack: the
  // form that deleted it is popped and the ledger is behind, so one pop from
  // here lands back on the ledger's own X, which lands here again. `dismissTo`
  // walks to the ledger however deep it is, and replaces this sheet with it
  // when it is not in the stack at all (a stale link, the deep-link case).
  const dismissToLedger = useDismissTo(ledgerHref);

  if (expenses.status === "loading") {
    return (
      <FullscreenDialog title="Expense" dismissHref={ledgerHref}>
        <LoadingBlock label="Loading the expense" />
      </FullscreenDialog>
    );
  }
  if (expenses.status === "offline") {
    return (
      <FullscreenDialog title="Expense" dismissHref={ledgerHref}>
        <OfflineBlock onRetry={expenses.retry} />
      </FullscreenDialog>
    );
  }
  if (expenses.status === "error") {
    return (
      <FullscreenDialog title="Expense" dismissHref={ledgerHref}>
        <InlineError
          message="Couldn't load the expense"
          onRetry={expenses.retry}
        />
      </FullscreenDialog>
    );
  }
  if (!row) {
    return (
      <FullscreenDialog
        title="Expense"
        primaryTitle="Done"
        onPrimary={() => dismissToLedger()}
        dismissHref={ledgerHref}
      >
        <Text className="font-body text-base text-ink">
          That expense is not here any more.
        </Text>
      </FullscreenDialog>
    );
  }

  // The author, or anybody running the trip: the API's own rule for a
  // write (`payment.service.ts`'s `canModifyPayment`), mirrored rather
  // than invented. Everyone else gets Done — the split of somebody else's
  // expense is a thing to read, and a form behind every row would read as
  // an offer to change rows that are not yours.
  const canEdit =
    row.createdBy === viewer?.userId || (viewer?.isOrganizer ?? false);

  return (
    <FullscreenDialog
      title={row.description}
      primaryTitle={canEdit ? "Edit expense" : "Done"}
      onPrimary={
        canEdit
          ? () =>
              router.push(
                `/trips/settle/form?id=${trip.id}&payment=${row.id}`,
              )
          : dismiss
      }
      dismissHref={ledgerHref}
    >
      <ExpenseDetail
        payment={row}
        timeZone={timeZone}
        viewerMemberId={viewer?.id ?? null}
      />
    </FullscreenDialog>
  );
}
