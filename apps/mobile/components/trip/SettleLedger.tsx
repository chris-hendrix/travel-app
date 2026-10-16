import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { QuietAction } from "@/components/ui/QuietAction";
import { RuledRows } from "@/components/ui/RuledRows";
import { useMotion } from "@/hooks/useMotion";
import { formatDay } from "@/lib/dateRange";
import { formatCents } from "@/lib/money";
import {
  moveFor,
  paymentDay,
  paymentsInOrder,
  positionFor,
  type BalanceMove,
  type Payment,
} from "@/lib/payments";
import { useBalances, useMyBalance } from "@/lib/queries/balances";
import { usePayments } from "@/lib/queries/payments";
import { joinFacts } from "@/lib/wording";

/**
 * The trip's ledger: your position, who owes whom, and every expense.
 *
 * Three blocks, in that order, and the order is the reading. Your own
 * position is the question the door was pressed with, so it is the first
 * thing on the sheet; the moves say what can be done about it; the entries
 * are the record behind both, which is why they come last rather than
 * first.
 *
 * **The sheet shows days, never a clock, so it registers no display
 * zone.** `lib/displayZone.tsx` is for the surfaces that show times; a
 * token here would name a clock for a sheet that has none, which is a
 * claim rather than a fact. The day is still *read* in the zone the
 * display clock names, because that is the zone it was stamped in
 * (`paymentDay`), and the caller computes that one value and hands it in.
 *
 * **Two plain headings, and no ruled block.** A block rule marks a
 * boundary, and the tables below these two headings have nothing above
 * them to be ruled off from but the block that already is; so the headings
 * wear the run's own heading form — the display face's smallest step, in
 * caps, which is `RuledBlock`'s title — written as a plain `Text` instead
 * of spending a rule on a seam that is not there.
 *
 * **The states are per block, not per sheet.** The three reads are three
 * requests, and the app's rule is that a failure belongs to the block that
 * asked (`InlineError.tsx`), so each block carries its own loading line,
 * its own failure and its own retry. They land together in practice; they
 * are still three retries.
 */
export function SettleLedger({
  tripId,
  timeZone,
  viewerMemberId,
}: {
  tripId: string;
  /**
   * The zone the days are read back in — `clock === "trip" ?
   * trip.preferredTimezone : null` from `useTripSettings`, the same value
   * the form stamps with, so a day round-trips. `null` is the device's.
   */
  timeZone: string | null;
  /**
   * The reader's own **member** id, the space `moveFor` and the payer line
   * substitute "You" in. Null when the signed-in account has no roster row
   * — nothing matches it, so the rows name both people.
   */
  viewerMemberId: string | null;
}) {
  const router = useRouter();
  const mine = useMyBalance(tripId);
  const debts = useBalances(tripId);
  const expenses = usePayments(tripId);

  // The server supplies no order at all (`getPaymentsByTrip` has no
  // `ORDER BY`), so the reader's order comes from `paymentsInOrder`. The
  // soft-deleted rows are dropped here rather than in the query: nothing
  // requests them, and the delete paints `deletedAt` optimistically, so
  // this is where a removal shows.
  const entries = paymentsInOrder(
    expenses.payments.filter((payment) => payment.deletedAt === null),
  );

  return (
    <View className="gap-6">
      {/* The position: the sheet's one number, and the only thing here at
          display size. A settled trip says so rather than printing
          "$0.00" (`positionFor`). */}
      <View>
        {mine.status === "loading" ? (
          <LoadingBlock label="Getting your balance" />
        ) : mine.status === "offline" ? (
          <OfflineBlock onRetry={mine.retry} />
        ) : mine.status === "error" ? (
          <InlineError
            message="Couldn't load your balance"
            onRetry={mine.retry}
          />
        ) : (
          <Text className={HEADLINE}>
            {positionFor(mine.balance.netBalance)}
          </Text>
        )}
      </View>

      {/* Who owes whom: the server has already simplified the debts, so
          each row is one move between two people and nothing here has to
          decide who pays whom. A row read across — the sentence, the door
          — so the rows keep the table's rule between them. */}
      <View>
        {debts.status === "loading" ? (
          <LoadingBlock label="Getting the balances" />
        ) : debts.status === "offline" ? (
          <OfflineBlock onRetry={debts.retry} />
        ) : debts.status === "error" ? (
          <InlineError
            message="Couldn't load the balances"
            onRetry={debts.retry}
          />
        ) : (
          <>
            <Text className={SECTION_HEADING}>Who owes whom</Text>
            {debts.balances.length === 0 ? (
              <NothingYet />
            ) : (
              <RuledRows>
                {debts.balances.map((move) => {
                  // The door belongs to the reader's own moves. "Settle up"
                  // on "Liz owes Sam" is an invitation to record that
                  // somebody else paid somebody else, and four identical
                  // underlines down the column is the inflation the
                  // underline ratchet exists to stop. The other rows are
                  // the trip's picture, which is what "who owes whom" is
                  // for.
                  const mine =
                    viewerMemberId !== null &&
                    (move.from.id === viewerMemberId ||
                      move.to.id === viewerMemberId);
                  return (
                    <MoveRow
                      key={`${move.from.id}-${move.to.id}`}
                      move={move}
                      viewerMemberId={viewerMemberId}
                      onSettle={
                        mine
                          ? () =>
                              router.push(
                                `/trips/settle/form?id=${tripId}&settle=1&from=${move.from.id}&to=${move.to.id}`,
                              )
                          : undefined
                      }
                    />
                  );
                })}
              </RuledRows>
            )}
          </>
        )}
      </View>

      {/* Expenses: the record the two blocks above are arithmetic over.
          Every row is a door onto its own split, because "why do I owe
          $18.33" is the question a ledger exists to answer. */}
      <View>
        {expenses.status === "loading" ? (
          <LoadingBlock label="Getting the expenses" />
        ) : expenses.status === "offline" ? (
          <OfflineBlock onRetry={expenses.retry} />
        ) : expenses.status === "error" ? (
          <InlineError
            message="Couldn't load the expenses"
            onRetry={expenses.retry}
          />
        ) : (
          <>
            <Text className={SECTION_HEADING}>Expenses</Text>
            {entries.length === 0 ? (
              <NothingYet />
            ) : (
              <RuledRows>
                {entries.map((payment) => (
                  <ExpenseRow
                    key={payment.id}
                    payment={payment}
                    timeZone={timeZone}
                    viewerMemberId={viewerMemberId}
                    onPress={() =>
                      router.push(
                        `/trips/settle/detail?id=${tripId}&payment=${payment.id}`,
                      )
                    }
                  />
                ))}
              </RuledRows>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * The sheet's headline: the one number, and the only thing here at
 * display size. `display-sm` is the step the app's own screen titles
 * wear (`app/trips/index.tsx`, `app/notifications.tsx`), which is what
 * this is — the thing the door was pressed for.
 *
 * It was `heading-lg` until it was read on a screen: that is the step
 * `RuledBlock` gives a *section title*, so the answer and the two labels
 * below it were drawn identically and the sheet read as three peers with
 * no answer in it.
 */
const HEADLINE = "font-display-bold text-display-sm uppercase text-ink";

/**
 * A heading that leads a run of rows, with the line of air the run puts
 * under its own day headings (`pb-3`).
 *
 * `heading-md` is one step below `RuledBlock`'s title and wears the
 * **body** face, which is the scale's own rule: the display face never
 * sets anything a reader reads in a sentence, and a section label inside
 * a dialog is not a section title. The ladder is then display 32 for the
 * answer, body-bold 20 for its labels, body 16 for the rows.
 *
 * The air belongs to the heading rather than to the table, because a
 * table whose first row already carries no mark has no opening of its
 * own to open on.
 */
const SECTION_HEADING = `pb-3 font-body-bold text-heading-md uppercase text-ink`;

/** The row body: the sentence on the left, the door at the far edge. */
const ROW = "flex-row items-center justify-between gap-4 py-3";

/** The entry's body: the description above its own meta line, full width. */
const ENTRY_ROW = "gap-1 py-3";

/**
 * The empty sentence, said once and used by both tables.
 *
 * A table with nothing in it says so rather than drawing a heading over
 * nothing: the heading names a list, and a reader who has been shown a
 * heading and no rows cannot tell an empty trip from a failed read — which
 * is the whole reason the failure states above are blocks of their own.
 */
function NothingYet() {
  return (
    <Text className="font-body text-base text-ink opacity-60">
      Nothing here yet.
    </Text>
  );
}

/**
 * One simplified move, told from the reader's side: `moveFor` does the
 * telling, including the substitution that turns their own member row into
 * "You".
 *
 * The door is the row's second target rather than the row itself: the
 * sentence is a fact and the settle-up is a thing to do about it, and a
 * whole row that records a payment on a press is a row you cannot read
 * without risking one.
 *
 * `ariaLabel` because the word is drawn once per move: a reader walking
 * the sheet hears "Settle up" three times with nothing saying which debt
 * each one is for, so the sentence the row already shows is the name the
 * door is announced by — the same call the roster's own row words make.
 */
function MoveRow({
  move,
  viewerMemberId,
  onSettle,
  className,
}: {
  move: BalanceMove;
  viewerMemberId: string | null;
  /** The reader's own move. Omitted for a move between two other people,
   *  which is a fact about the trip rather than something to do. */
  onSettle?: (() => void) | undefined;
  /** The table's mark, handed down by `RuledRows`. */
  className?: string | undefined;
}) {
  const sentence = moveFor(move, viewerMemberId ?? "");

  return (
    <View className={[ROW, className].filter(Boolean).join(" ")}>
      <Text className="flex-1 font-body text-base text-ink">{sentence}</Text>
      {onSettle ? (
        <QuietAction
          label="Settle up"
          ariaLabel={`Settle up ${sentence}`}
          onPress={onSettle}
        />
      ) : null}
    </View>
  );
}

/**
 * One entry: what it was, who filed it and when and how, and the amount.
 *
 * The note rides the meta line rather than being a sentence of its own —
 * "what was it" and "how was it paid" are two facts, and the second one
 * belongs between the day and the amount rather than under the row. The
 * amount keeps the far edge, so the column reads down the sheet.
 *
 * The press is the whole row and the mark is on the body inside it, which
 * is `RosterList`'s own split: the rule belongs to the row's measure, and
 * the press target is the row's shape.
 */
function ExpenseRow({
  payment,
  timeZone,
  viewerMemberId,
  onPress,
  className,
}: {
  payment: Payment;
  timeZone: string | null;
  viewerMemberId: string | null;
  onPress: () => void;
  /** The table's mark, handed down by `RuledRows`. */
  className?: string | undefined;
}) {
  const motion = useMotion();
  const day = formatDay(paymentDay(payment, timeZone));
  // "You paid" when it is the reader's own member row — the same
  // substitution `moveFor` makes, on the same **member** id space (never
  // `payment.createdBy`, which is a user id).
  const payer =
    payment.payerMemberId === viewerMemberId
      ? "You paid"
      : `${payment.payerName} paid`;

  return (
    <Pressable role="button" onPress={onPress} className={motion.rowOnGravel}>
      <View className={[ENTRY_ROW, className].filter(Boolean).join(" ")}>
        <Text className="font-body-bold text-base text-ink">
          {payment.description}
        </Text>
        {/* The meta and the amount share the second line: the facts read
            from the left edge, the number keeps the right one, and the
            description above them spans both. `joinFacts` drops the note
            when there is not one, so a row with none is two facts and
            never a stranded separator.

            `items-start`, not `items-center`: a long note wraps the meta
            to two lines, and centring dropped that row's amount half a
            line below every other row's, so the column read as broken
            rather than as a column. */}
        <View className="flex-row items-start justify-between gap-4">
          <Text className="flex-1 font-body text-sm text-ink opacity-60">
            {joinFacts(payer, day, payment.note)}
          </Text>
          <Text className="shrink-0 font-body text-base text-ink">
            {formatCents(payment.amount)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
