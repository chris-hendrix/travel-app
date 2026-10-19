import { Text, View } from "react-native";

import { Fact } from "@/components/ui/Fact";
import { LinkedText } from "@/components/ui/LinkedText";
import { QuietAction } from "@/components/ui/QuietAction";
import { RuledBlock } from "@/components/ui/RuledBlock";
import { RuledRows } from "@/components/ui/RuledRows";
import { useCopied } from "@/hooks/useCopied";
import { formatDay } from "@/lib/dateRange";
import { formatCents } from "@/lib/money";
import {
  paymentDay,
  type Payment,
  type PaymentParticipant,
} from "@/lib/payments";

/**
 * One expense, read whole: what it was, what it came to, and who is on the
 * split for how much.
 *
 * **The amount leads, not the description.** The description is already
 * the dialog's title, so repeating it in the body would say it twice; what
 * the reader opened this for is the number, and the day is the fact that
 * makes the number mean something ("$45 was last Friday, not this
 * Friday"). The split comes next, because "why do I owe $18.33" is the
 * question a ledger exists to answer, and the payer and the note are the
 * two facts about *how* rather than *what* — which is why they are the
 * tail rather than the head.
 *
 * **The split is one ruled block, and its rows are a table.** A row read
 * across — a name, then the number that name owes — needs the rule to say
 * where it ends (the table rank in `RuledRows`'s own words), and the
 * block's rule is what separates the split from the amount above it. It is
 * the dialog's only rule: the facts below read down, and a list's rows
 * group by proximity alone.
 *
 * **Two id spaces, and they are not interchangeable.** `payment.createdBy`
 * is a **user** id (`payments.created_by` references `users.id`) while a
 * participant's `memberId`, the `payerMemberId` and `viewerMemberId` are
 * all **member** ids — so "You" in the split is
 * `participant.memberId === viewerMemberId`, never a comparison against
 * `createdBy`. The author's Edit predicate is the other half of that and
 * lives at the route, where the viewer's own row is in scope.
 *
 * The roster is not read here: the server attaches each participant's name
 * (`payment.service.ts` joins them), so the split arrives with everything
 * it draws.
 */

export function ExpenseDetail({
  payment,
  timeZone,
  viewerMemberId,
}: {
  payment: Payment;
  /** The zone the day is read back in — the one it was stamped in, so it
   *  round-trips (`paymentDay`). `null` is the device's. */
  timeZone: string | null;
  /** The reader's own **member** id: the row that reads as "You". */
  viewerMemberId: string | null;
}) {
  // The note's own answer, held for the word that gave it, and the note
  // itself read before it: the copy's press is a closure and TypeScript does
  // not carry a property's narrowing into one.
  const note = payment.note;
  const { copied, copy } = useCopied();

  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="font-display-semibold text-heading-lg text-ink">
          {formatCents(payment.amount)}
        </Text>
        <Text className="font-body text-sm text-ink opacity-60">
          {formatDay(paymentDay(payment, timeZone))}
        </Text>
      </View>

      <RuledBlock title="Split">
        <RuledRows>
          {payment.participants.map((participant) => (
            <SplitRow
              key={participant.id}
              participant={participant}
              viewerMemberId={viewerMemberId}
            />
          ))}
        </RuledRows>
      </RuledBlock>

      <View className="gap-4">
        <Fact label="Paid by">
          <Text className="font-body text-base text-ink">
            {payment.payerMemberId === viewerMemberId
              ? "You"
              : payment.payerName}
          </Text>
        </Fact>
        {/* No note, no row: an absent fact is not an empty one, and a
            labelled blank reads as something the reader failed to fill
            in. The prose is read through `LinkedText`, so an address in it
            presses where it sits, and selection went because it and links
            cannot share a `Text` (`LinkedText` argues it). The `Copy` is a
            sibling of the `Fact` rather than its child because `Fact` is a
            label and a value and nothing else. */}
        {note ? (
          <>
            <Fact label="Note">
              <LinkedText
                className="font-body text-base text-ink"
                text={note}
              />
            </Fact>
            <QuietAction
              label={copied ? "Copied" : "Copy"}
              ariaLabel="Copy the note"
              onPress={() => copy(note)}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** The row body: the name on the left, the share at the far edge. */
const ROW = "flex-row items-center justify-between gap-4 py-3";

/**
 * One person's share, on the row the table reads across.
 *
 * "You" replaces the reader's own name, on the **member** id space — the
 * same substitution the ledger's rows make. The name is never derived from
 * `payment.createdBy`, which is a user id and answers a different question.
 */
function SplitRow({
  participant,
  viewerMemberId,
  className,
}: {
  participant: PaymentParticipant;
  viewerMemberId: string | null;
  /** The table's mark, handed down by `RuledRows`. */
  className?: string | undefined;
}) {
  return (
    <View className={[ROW, className].filter(Boolean).join(" ")}>
      <Text className="flex-1 font-body text-base text-ink">
        {participant.memberId === viewerMemberId ? "You" : participant.name}
      </Text>
      <Text className="shrink-0 font-body text-base text-ink">
        {formatCents(participant.shareAmount)}
      </Text>
    </View>
  );
}
