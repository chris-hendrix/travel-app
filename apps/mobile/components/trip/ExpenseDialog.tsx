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
import {
  SCOPE_LABEL,
  emptyScopeSentence,
  splitForScope,
  splitPreview,
  type SplitScope,
} from "@/lib/payments";
import { joinFacts } from "@/lib/wording";
import { withPayerFallback } from "@journiful/shared/utils";

/**
 * The expense form, in one place because there is one of it: adding,
 * editing and settling up ask the same questions about the same row, and
 * only the prefill and the verb change.
 *
 * **The split is asked as a rule, and the people are what it resolves to.**
 * "Split with" is a `Dropdown` — `Everyone going`, `Everyone invited`,
 * `Choose people` — the same control "Paid by" is, because it is the same
 * kind of question: one answer out of a few. Three long labels do not fit
 * a `Segmented` row at 390px, and `Choose people` is the third item of the
 * same menu rather than a second control, because it is a third answer to
 * the same question. A rule draws the people it resolves to, with their
 * shares and **no boxes**: they are re-resolved against the roster on
 * every read, so they are a fact about who shares the cost rather than a
 * snapshot the reader is previewing. Only `Choose people` draws the
 * checkbox list, seeded with what the rule resolved to the first time it
 * was picked: once the reader has a list of their own, leaving the mode
 * and coming back is a reader still editing it, not a fresh start. The
 * reader edits the people they were just shown.
 *
 * **A split is never empty, and the two modes answer that differently.**
 * The server refuses a create whose rule resolves to nobody
 * (`EmptySplitError`), and every read of a scoped row falls back to the
 * payer owing the whole amount (`withPayerFallback`). So a create draws
 * the reason at the point the rows would be, where the reader can see why
 * the save will refuse, and an edit draws the payer's row, which is the
 * split the server will store and read back.
 *
 * **The split is previewed with the server's own arithmetic.** A rule
 * resolves through `splitForScope` — `scopeMemberIds` and then
 * `equalShares`, the two functions the API records with — and a fixed list
 * goes through `splitPreview`, which is that same `equalShares`. The API
 * gives the remainder cent to the first participant in the array it is
 * sent, and the form sends exactly the array it previewed, in the same
 * order: a rule's people in member-id order, a fixed list in the roster's
 * order. So the shares on screen are the shares the server will record.
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
 * the role). So the two pickers still carry every row and filter on
 * nothing: "Paid by" is the whole roster, and the fixed list is the whole
 * roster too, ticked or not. Narrowing a split to who is going is a
 * **choice**, made in the menu above it — `Everyone going` is every member
 * who said yes plus every guest, because a guest never answers an RSVP —
 * and never a filter this form applies on the reader's behalf.
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
   * How the cost is shared: one of the two rules the server resolves
   * against the roster, or `custom` for the fixed list below. Required,
   * because every mode has one — a new expense starts on `all_going`, an
   * edit carries the row's own scope, and settle-up is `custom` with its
   * one locked person.
   */
  scope: SplitScope;
  /**
   * The people on the split, in the order the payload sends them: a rule's
   * resolved people in **member-id order**, a fixed list in the roster's
   * order. Either way it is the array the shares above were previewed in,
   * which is what makes the preview the server's answer.
   *
   * For a rule this list is not part of the body — the request names the
   * rule and no people at all — but the route still hands it to the
   * mutation as the paint list, because a scoped create has no participant
   * array in its request to paint the optimistic row from.
   *
   * Empty is a form that was not finished, or a roster where nobody is
   * going. Never a payload — except in one case, which is the payer floor:
   * editing a scoped row whose rule resolves to nobody sends the payer
   * alone, because that is the split the server stores and reads back.
   */
  participantIds: string[];
  /** yyyy-mm-dd, the day the expense belongs to. */
  day: string;
};

export type ExpenseErrors = Partial<
  Record<
    "description" | "amount" | "payer" | "participants" | "scope" | "day",
    string
  >
>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The three answers "Split with" offers, in the order the menu lists them.
 *
 * Not `SPLIT_SCOPES`, which leads with `custom` because that is the
 * column's order. The form asks the rule first and `Choose people` last:
 * naming the people yourself is the fallback, not the default, and the two
 * rules are what the trip is actually shared by.
 */
const SCOPE_ORDER: SplitScope[] = ["all_going", "all_invited", "custom"];

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
  // A rule that resolves to nobody is refused the same way an empty list
  // is: the split is who the cost was between, and it is the one field whose
  // emptiness the API answers with a 400 (`EmptySplitError`). The message
  // names the way out — the third answer in the menu above it — because a
  // scope with no people in it is a roster that has not said yes yet, not a
  // box the reader failed to tick. The resolved ids are the list either way,
  // so this is one predicate and not two. An **edit** never reaches it: the
  // form puts the payer at the floor before the list is built, which is what
  // the API does on the read and accepts on the update.
  if (input.participantIds.length === 0) {
    if (input.scope === "custom") {
      errors.participants = "Nobody is on the split.";
    } else {
      errors.scope =
        "Set Split with to Choose people, then tick who it was between.";
    }
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

/**
 * One person on the split: their name at the near edge, their share at the
 * far one, and nothing between.
 *
 * The settle-up row's own shape, extracted rather than rewritten, so the
 * one locked person and a rule's resolved people are literally the same row
 * instead of two that happen to match. No box and no rule: a resolved row is
 * a fact about who shares the cost, so it has nothing to press, and a list
 * read down keeps no mark in this system (the table rank is for a row read
 * across, and this is not a table).
 *
 * A null amount is no amount: the share is blank until there is a total to
 * divide, because "$0.00" beside a name reads as a share that is nothing
 * rather than as a split that has not been priced yet.
 */
function ShareRow({ label, amount }: { label: string; amount: number | null }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="font-body text-sm text-ink">{label}</Text>
      <Text className="shrink-0 font-body text-sm text-ink opacity-60">
        {amount === null ? "" : formatCents(amount)}
      </Text>
    </View>
  );
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
   * Prefill. An absent `scope` is a **new** expense, which starts on
   * `Everyone going` — the rule a group cost is usually shared by, and one
   * that follows the roster from then on rather than snapshotting it here.
   * An absent `participantIds` seeds the fixed list with what that rule
   * resolves to, so the boxes a reader un-hides are the people they were
   * just reading. Neither is a courtesy to the payer: a rule says who
   * shares the cost, not who paid.
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
  /**
   * Editing only, and permanent on the server (`payment.service.ts`'s
   * `deletePayment`): the foot row's danger button arms a confirmation
   * rather than firing on the first press, because there is no undo.
   */
  onDelete?: (() => void) | undefined;
  /** A write is in flight: the dialog's own two buttons stop. */
  pending?: boolean;
}) {
  // The delete's first press: the foot button inverts and a way out appears
  // above it. The same two-step the member card takes, because a permanent
  // write asks the same question wherever it lives.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
  // Settle-up is a fixed list of one, so it has no rule to offer: the move
  // named two people and one amount, and the split is the person it owes.
  const locked = lockedParticipantId !== null;
  // The form was opened on a row rather than on nothing: `initial.scope` is
  // the rule that row carries, and its absence is exactly a new expense (see
  // the prop). It is the one distinction the empty split below turns on,
  // because the API answers the two cases differently.
  const editing = initial?.scope !== undefined;
  // The rule a new expense starts on. Everyone going is who a group cost is
  // usually between, and it is a rule rather than a courtesy: the payer is
  // not forced in, so a reader whose own answer is "maybe" is legitimately
  // off their own default split, and the resolved rows are what say so.
  const initialScope: SplitScope = locked
    ? "custom"
    : (initial?.scope ?? "all_going");
  const [scope, setScope] = useState<SplitScope>(initialScope);
  // The reader's own fixed list, and only theirs. Seeded once: from the row
  // when the form opened on `Choose people`, from what the rule resolves to
  // the first time they pick it otherwise, and never again — a list they have
  // edited is theirs, and re-seeding it on the way back into the mode would
  // silently re-tick everyone they had just unticked. `null` until they have
  // been in the mode at all, which is what makes "seeded" and "touched" the
  // same question.
  const [customIds, setCustomIds] = useState<string[] | null>(() =>
    initialScope === "custom"
      ? (initial?.participantIds ??
        splitForScope(initialScope, members, 0).map((share) => share.memberId))
      : null,
  );
  const [day, setDay] = useState(initial?.day ?? "");
  const [submitted, setSubmitted] = useState(false);

  const cents = parseAmount(amount);
  const scoped = scope !== "custom";
  // The rule's people, in member-id order, priced at whatever has been typed
  // so far. The amount only decides the shares — the resolver divides after
  // it has resolved the roster — so `0` is a stand-in until something is.
  const resolved = scoped ? splitForScope(scope, members, cents ?? 0) : [];
  // The payer floor (`withPayerFallback`, D5), on an edit only. Every read of
  // a scoped row is floored to the payer and an update is accepted and read
  // back the same way, while a create is refused (`EmptySplitError`). So an
  // edit whose roster has moved out from under its rule shows the payer owing
  // the lot, which is the split the server will store, and a create still
  // refuses it and says why. A form with no payer at all has no floor to
  // stand on, and that field is already asking its own question.
  const scopedIds =
    editing && payerMemberId !== null
      ? withPayerFallback(
          resolved.map((share) => share.memberId),
          payerMemberId,
        )
      : resolved.map((share) => share.memberId);
  // The people the row will carry, in the order it carries them: a rule's
  // resolved list in member-id order, a fixed list in the roster's order,
  // filtered to what is ticked. Derived rather than stored, so no press can
  // put the array out of the order the preview was computed in.
  const participantIds = scoped
    ? scopedIds
    : members
        .filter((member) => (customIds ?? []).includes(member.id))
        .map((member) => member.id);
  // What each of them owes, in the order above: one division for both modes,
  // because a rule's shares are `equalShares` over the list it resolved and a
  // fixed list's are the same division over the ticked rows. Empty until
  // there is an amount to divide: a "$0.00" beside a name before anything has
  // been typed reads as a share that is nothing rather than as a split that is
  // not decided yet, and the amount field is already saying "Enter an
  // amount."
  const shares = cents === null ? [] : splitPreview(cents, participantIds);
  const shareOf = new Map<string, number>(
    participantIds.map((memberId, index) => [memberId, shares[index] ?? 0]),
  );

  const input: ExpenseInput = {
    description,
    amount,
    note,
    payerMemberId,
    scope,
    participantIds,
    day,
  };
  const errors: ExpenseErrors = submitted ? validateExpense(input) : {};

  const lockedMember = lockedParticipantId
    ? (members.find((member) => member.id === lockedParticipantId) ?? null)
    : null;

  function toggle(memberId: string) {
    setCustomIds((ids) => {
      const list = ids ?? [];
      return list.includes(memberId)
        ? list.filter((id) => id !== memberId)
        : [...list, memberId];
    });
  }

  /**
   * Choosing a rule, or choosing to pick people. The dropdown hands back a
   * string, so the answer is looked up in the menu's own list rather than
   * cast: a value that is not one of the three changes nothing.
   */
  function changeScope(next: string) {
    const chosen = SCOPE_ORDER.find((option) => option === next);
    if (!chosen || chosen === scope) return;
    // The boxes arrive ticked with what the rule resolved to at this
    // moment, in the same order — the reader adjusts the people they were
    // just shown, rather than starting from nothing or from every row. Only
    // the first time: a list the reader has edited is theirs, so leaving the
    // mode and coming back must not re-tick what they unticked.
    if (chosen === "custom") {
      setCustomIds(
        (ids) =>
          ids ??
          splitForScope(scope, members, 0).map((share) => share.memberId),
      );
    }
    setScope(chosen);
  }

  // The danger button's two states, read once instead of as nested ternaries
  // in the props: the first press arms the ask, the second does it.
  const dangerTitle = onDelete
    ? confirmingDelete
      ? "Delete expense, for good"
      : "Delete expense"
    : undefined;
  const onDanger = onDelete
    ? () => {
        if (confirmingDelete) onDelete();
        else setConfirmingDelete(true);
      }
    : undefined;

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
      dangerTitle={dangerTitle}
      onDanger={onDanger}
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
        {/* The rule comes first, and it is the same control "Paid by" is: a
            `Dropdown` at the form's own width, because it is the same kind of
            question — one answer out of a few. Three long labels do not fit a
            `Segmented` row at 390px, and `Choose people` is the third item of
            this menu rather than a second control, because it is a third
            answer to the same question. Non-searchable, so the field is a
            value that opens a list and nothing can be typed into it that is
            not one of the three. */}
        {locked ? (
          <Text className="font-body-bold text-sm text-ink">Split with</Text>
        ) : (
          <Dropdown
            label="Split with"
            options={SCOPE_ORDER.map((option) => ({
              value: option,
              label: SCOPE_LABEL[option],
            }))}
            value={scope}
            onChange={changeScope}
            placeholder="Pick who shares it…"
            searchable={false}
          />
        )}
        {lockedMember ? (
          // Settle-up: the move named one person, so the row is a fact and
          // not a control. A disabled checkbox would be a box that says
          // "you could" about something you cannot.
          <ShareRow label={memberLabel(lockedMember)} amount={cents} />
        ) : scoped ? (
          participantIds.length > 0 ? (
            // A rule's people are a fact, not a preview of a snapshot: the
            // server re-resolves the scope against the roster on every read,
            // so a box here would offer to change a split that is not this
            // form's to fix. The shares beside them are the same resolver's
            // answer, and the order is the order the payload sends. On an
            // edit a rule that resolves to nobody lands here too, as the
            // payer alone: that is the row the server stores and reads back.
            participantIds.map((memberId) => {
              const member = members.find((row) => row.id === memberId);
              if (!member) return null;
              return (
                <ShareRow
                  key={memberId}
                  label={memberLabel(member)}
                  amount={shareOf.get(memberId) ?? null}
                />
              );
            })
          ) : (
            // A create whose rule resolves to nobody: there is no row to
            // draw, so the slot says what the rule came back with and why
            // the save will refuse, at the point the reader is looking. The
            // refusal is the second line of the same message rather than a
            // line under the menu, because the empty slot is what it is
            // about.
            <View className="gap-1">
              <Text className="font-body text-sm text-ink opacity-60">
                {emptyScopeSentence(scope)}
              </Text>
              <FieldError message={errors.scope} />
            </View>
          )
        ) : (
          members.map((member) => (
            <Checkbox
              key={member.id}
              checked={(customIds ?? []).includes(member.id)}
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

      {/* The confirmation, in the body rather than in the foot row: the
          button that asks is the button that does it, and this is what it
          says before it does. No undo exists to offer, so the way out has to
          be visible while the finger is still on the button. */}
      {onDelete && confirmingDelete ? (
        <View className="gap-2">
          <Text className="font-body text-base text-ink">
            Deleting an expense is permanent.
          </Text>
          <QuietAction
            label="Keep it"
            ariaLabel="Keep this expense"
            onPress={() => setConfirmingDelete(false)}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
