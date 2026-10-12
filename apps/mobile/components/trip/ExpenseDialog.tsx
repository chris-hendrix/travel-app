import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";

import { Checkbox, CheckboxLabel } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dropdown } from "@/components/ui/Dropdown";
import { FieldError } from "@/components/ui/FieldError";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { QuietAction } from "@/components/ui/QuietAction";
import { TextField } from "@/components/ui/TextField";
import type { Member } from "@/lib/members";
import { amountError, formatCents, parseAmount } from "@/lib/money";
import { splitPreview } from "@/lib/payments";
import { joinFacts } from "@/lib/wording";

/**
 * The expense form, in one place because there is one of it: adding,
 * editing and settling up ask the same questions about the same row, and
 * only the prefill and the verb change.
 *
 * **The split is previewed with the server's own arithmetic.** The API
 * gives the remainder cent to the first participant in the array it is
 * sent, and `splitPreview` mirrors that exactly, so the shares under the
 * checkboxes are the shares the server will record — but only if the form
 * sends the same array in the same order. It does: the rows are the
 * roster's order and the payload is the checked subset of that order, not
 * a set that happens to hold the same members.
 *
 * **This form is the only surface in the app that writes money**, and it
 * is also the first dialog whose fields want a numeric keypad. The
 * keypad's tap-through belongs to the scaffold, not here (see
 * `FullscreenDialog.tsx`).
 *
 * **Guests are members.** `members` rows with no account behind them are
 * rows like any other — any member may name one as the payer and any
 * member may put one in the split, which is the server's own rule
 * (`payment.service.ts`'s `assertMembersInTrip` validates the trip, not
 * the role). So the pickers carry every row and filter on nothing; in
 * particular they do **not** borrow travel's `status === "going"` filter,
 * which would hide a guest or an undecided member from the split they are
 * owed to be in.
 *
 * A guest wears the roster's own word for them (`Guest`, the roll call's
 * far column) rather than a second name invented here.
 */
export type ExpenseInput = {
  description: string;
  /** As typed. Parsed by `parseAmount` at the one boundary, never by this. */
  amount: string;
  /** "how was it paid", as typed. `""` is the clearing value, not an omission. */
  note: string;
  /** A **member** id, never the account's user id. */
  payerMemberId: string | null;
  /**
   * The people on the split, in the roster's order — the order the row is
   * sent in, and therefore the order the shares are the server's shares
   * in. Empty is a form that was not finished, never a payload.
   */
  participantIds: string[];
  /** yyyy-mm-dd, the day the expense belongs to. */
  day: string;
};

export type ExpenseErrors = Partial<
  Record<"description" | "amount" | "payer" | "participants" | "day", string>
>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What is missing, said once per field and under it. Pure, so the dialog
 * stays a thin shell over it — the same arrangement `validateNewStay`
 * makes for the stay form.
 *
 * The description and the amount are the expense; the payer and the split
 * are who it was between, and the API's own schema refuses an empty
 * `participants` array (`shared/schemas/payment.ts`'s `.min(1)`), so an
 * untouched split is a field error here rather than a 400 there. The note
 * is never required: an expense with nobody's name on the payment is an
 * expense.
 */
export function validateExpense(input: ExpenseInput): ExpenseErrors {
  const errors: ExpenseErrors = {};

  if (!input.description.trim()) {
    errors.description = "Give the expense a name.";
  }

  const amount = amountError(input.amount);
  if (amount) errors.amount = amount;

  if (!input.payerMemberId) errors.payer = "Who paid?";
  if (input.participantIds.length === 0) {
    errors.participants = "Nobody is on the split.";
  }
  if (!DAY.test(input.day)) errors.day = "Pick the day.";

  return errors;
}

/**
 * How a member row is named in a picker: their name, and `Guest` when
 * there is no account behind the row. `joinFacts` rather than a bracket,
 * because the roster's own second fact is a separate fact and the app
 * joins those with a middot everywhere else.
 */
export function memberLabel(member: Member): string {
  return joinFacts(member.name, member.userId === null ? "Guest" : null);
}

export function ExpenseDialog({
  title,
  primaryTitle,
  members,
  viewerMemberId,
  isOrganizer = false,
  dismissHref,
  initial,
  lockedParticipantId = null,
  onAddGuest,
  serverError,
  onSubmit,
  onDelete,
  pending = false,
}: {
  title: string;
  /** The dialog's one verb: "Add expense", "Save changes" or "Record payment". */
  primaryTitle: string;
  /** The roster. Every row belongs in both pickers — guests included. */
  members: Member[];
  /**
   * The reader's own **member** id (`viewerOf(members, user?.id)?.id`),
   * which is what a default is drawn from: the payer starts as the person
   * holding the phone, and their own row starts on the split. Never
   * `createdBy`, which is a user id.
   */
  viewerMemberId: string | null;
  /** The reader runs the trip: they get the door onto a new guest. */
  isOrganizer?: boolean;
  dismissHref: string;
  /**
   * Prefill. An absent `participantIds` is a **new** expense, and then the
   * split starts on the payer, on everyone going and on every guest —
   * defaults, not rules: every box is the reader's to uncheck, the payer's
   * included, because a trip where the payer was reimbursed by everyone
   * else is a real expense.
   */
  initial?: Partial<ExpenseInput>;
  /**
   * Settle-up mode: the move names two people and one amount, so the split
   * is that one person and is not the reader's to rearrange. The debt row
   * this was opened from said exactly who owes whom; a form that let it be
   * edited would be recording a different thing than the row it came from.
   */
  lockedParticipantId?: string | null;
  /** Organizers only: the foot row's door onto `/trips/members/new`. */
  onAddGuest?: (() => void) | undefined;
  /** The last write's failure. The dialog stays open on failure. */
  serverError?: string | null;
  /** Handed an input that has already passed validation, and its cents. */
  onSubmit: (input: ExpenseInput, cents: number) => void;
  /** Editing only. Soft on the server, so it needs no confirmation step. */
  onDelete?: (() => void) | undefined;
  /** A write is in flight: the dialog's own two buttons stop. */
  pending?: boolean;
}) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  // A `null` note reads as an empty field: the wire gives the read side
  // `string | null` while the update schema refuses an explicit `null` and
  // clears on `""` (`lib/queries/payments.ts`), so the field is the place
  // the two spellings are reconciled — `null` in, `""` out.
  const [note, setNote] = useState(initial?.note ?? "");
  // The payer starts as the person holding the phone — the reader paid
  // for the thing they are recording far more often than not — and as
  // whatever the caller prefilled it with (a settlement knows both ends).
  const defaultPayerId = initial?.payerMemberId ?? viewerMemberId ?? null;
  const [payerMemberId, setPayerMemberId] = useState<string | null>(
    defaultPayerId,
  );
  const [checkedIds, setCheckedIds] = useState<string[]>(
    () =>
      initial?.participantIds ??
      members
        .filter(
          (member) =>
            member.id === defaultPayerId ||
            member.status === "going" ||
            member.userId === null,
        )
        .map((member) => member.id),
  );
  const [day, setDay] = useState(initial?.day ?? "");
  const [submitted, setSubmitted] = useState(false);

  // What the row will carry: the roster's order, filtered to what is
  // ticked. Derived rather than stored, so no press can put the array out
  // of the order the preview was computed in.
  const participantIds = members
    .filter((member) => checkedIds.includes(member.id))
    .map((member) => member.id);
  const cents = parseAmount(amount);
  const shares = cents === null ? [] : splitPreview(cents, participantIds);
  // Empty until there is an amount to divide. A checked row beside a
  // "$0.00" before anything has been typed reads as a share that is
  // nothing rather than as a split that has not been decided yet, and
  // the amount field is already saying "Enter an amount."
  const shareOf = new Map(
    cents === null
      ? []
      : participantIds.map((memberId, index) => [
          memberId,
          shares[index] ?? 0,
        ]),
  );

  const input: ExpenseInput = {
    description,
    amount,
    note,
    payerMemberId,
    participantIds,
    day,
  };
  const errors: ExpenseErrors = submitted ? validateExpense(input) : {};

  const lockedMember = lockedParticipantId
    ? (members.find((member) => member.id === lockedParticipantId) ?? null)
    : null;

  function toggle(memberId: string) {
    setCheckedIds((ids) =>
      ids.includes(memberId)
        ? ids.filter((id) => id !== memberId)
        : [...ids, memberId],
    );
  }

  function submit() {
    setSubmitted(true);
    if (Object.keys(validateExpense(input)).length > 0) return;
    if (cents === null) return;
    onSubmit(input, cents);
  }

  return (
    <FullscreenDialog
      title={title}
      primaryTitle={primaryTitle}
      onPrimary={submit}
      pending={pending}
      dangerTitle={onDelete ? "Delete expense" : undefined}
      onDanger={onDelete}
      dismissHref={dismissHref}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      {serverError ? <InlineError message={serverError} /> : null}

      <TextField
        label="What was it?"
        value={description}
        onChangeText={setDescription}
        placeholder="Dinner"
        maxLength={500}
        error={errors.description}
      />

      {/* The amount is the one field here the platform has a keypad for,
          and the suffix names the currency the whole surface is in
          (`lib/money.ts`) rather than a second column on the row. */}
      <TextField
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="45.00"
        keyboardType="decimal-pad"
        suffix={
          <View className="justify-center px-4">
            <Text className="font-body text-sm text-ink opacity-60">USD</Text>
          </View>
        }
        error={errors.amount}
      />

      {/* "How was it paid" is a different fact from "what was it", and the
          placeholder is the example the ledger row was written for. An
          emptied field is a cleared note, not an absent one. */}
      <TextField
        label="Note"
        value={note}
        onChangeText={setNote}
        placeholder="Paid by Venmo"
        maxLength={280}
      />

      <Dropdown
        label="Paid by"
        options={members.map((member) => ({
          value: member.id,
          label: memberLabel(member),
        }))}
        value={payerMemberId}
        onChange={setPayerMemberId}
        placeholder="Pick who paid…"
        error={errors.payer}
      />

      <View className="gap-3">
        <Text className="font-body-bold text-sm text-ink">Split with</Text>
        {lockedMember ? (
          // Settle-up: the move named one person, so the row is a fact and
          // not a control. A disabled checkbox would be a box that says
          // "you could" about something you cannot.
          <View className="flex-row items-center justify-between gap-4">
            <Text className="font-body text-sm text-ink">
              {memberLabel(lockedMember)}
            </Text>
            <Text className="shrink-0 font-body text-sm text-ink opacity-60">
              {cents === null ? "" : formatCents(cents)}
            </Text>
          </View>
        ) : (
          members.map((member) => (
            <Checkbox
              key={member.id}
              checked={checkedIds.includes(member.id)}
              onToggle={() => toggle(member.id)}
            >
              {/* The share sits opposite the name, and only for a row that
                  is on the split: a share beside an unchecked box would be
                  a number the reader is not paying. */}
              <View className="flex-row items-center justify-between gap-4">
                <CheckboxLabel>{memberLabel(member)}</CheckboxLabel>
                {shareOf.has(member.id) ? (
                  <Text className="shrink-0 font-body text-sm text-ink opacity-60">
                    {formatCents(shareOf.get(member.id) ?? 0)}
                  </Text>
                ) : null}
              </View>
            </Checkbox>
          ))
        )}
        <FieldError message={errors.participants} />
        {/* The people are a list you can only choose from, and the way to
            lengthen it is not in this form: a guest is created in the
            people half (`/trips/members/new`), which is where their name
            and number live. Organizers only, because creating a guest is
            the one thing the people half holds to the role. */}
        {isOrganizer && onAddGuest ? (
          <QuietAction
            label="Add a guest"
            ariaLabel="Add a guest to this trip"
            onPress={onAddGuest}
          />
        ) : null}
      </View>

      {/* The day is not bounded by the trip: an expense can predate it, the
          way a deposit does. Its default is today on the clock the ledger
          reads it back on, and both come from the caller — the zone rule
          belongs where the zone is computed (`app/trips/settle/form.tsx`),
          not here. */}
      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Day</Text>
        <DatePicker
          single
          selection={{ start: day || null, end: day || null }}
          onChange={(next) => setDay(next.start ?? day)}
        />
        <FieldError message={errors.day} />
      </View>
    </FullscreenDialog>
  );
}
