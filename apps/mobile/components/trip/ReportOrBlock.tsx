import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { InlineError } from "@/components/ui/InlineError";
import { QuietAction } from "@/components/ui/QuietAction";
import { TextField } from "@/components/ui/TextField";
import { isDemoIdentity, useAuth } from "@/lib/authStore";
import type { Member } from "@/lib/members";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORT_RECORDED_COPY,
  moderationFailureCopy,
  moderationPendingLabel,
  moderationTarget,
  type ModerationAction,
  type ReportReason,
} from "@/lib/moderation";
import { useBlockUser, useReportUser } from "@/lib/queries/moderation";

/**
 * Report or block, about the person whose card this is.
 *
 * It used to be a word under every account-backed row of the roll call,
 * and the roll call's job is reading who is coming rather than walking
 * past four buttons wearing people's names. The word lives on the
 * person's own card now: one word, at the foot of the facts, on the
 * screen a reader opened *about* this person.
 *
 * That is also where the App Store asks for it — a report and a block
 * have to be reachable by any user, and the profile of the person you are
 * reporting is where a reader looks. The app's admin side puts moderation
 * on a user detail for the same reason (`app/admin/users/detail.tsx`).
 *
 * Whoever can open the card gets this word: the gate is
 * `moderationTarget`'s — a member with an account behind it, never your own
 * card, and nothing at all in the demo — and it is deliberately not the
 * organizer's, because a report and a block are anybody's
 * (`lib/moderation.ts`). No undo is offered here: a block is account-wide
 * on the server, so the pair vanish from each other everywhere, and the
 * list that can actually still reach them is the one under the roll call.
 *
 * A card already carries one door and this is a second target that leads
 * nowhere: reporting somebody and blocking them are said *about* a person
 * rather than in their card, and a column of controls beside the facts
 * would turn the card into a list of buttons. A word at the foot of it is
 * the shape the app gives the quiet things.
 *
 * One state, one control: the word opens the panel in place and the panel
 * carries its own Cancel, so the two are never both on screen. The panel
 * expands rather than opening a dialog, because this surface is already a
 * `FullscreenDialog` and a dialog on a dialog is what the app does not do
 * (`profile.tsx`'s `confirming`, the armed delete in `app/trips/edit.tsx`).
 */
export function ReportOrBlock({
  member,
  tripId,
  onBlocked,
}: {
  member: Member;
  tripId: string;
  /** The block's own close: the person leaves the roster behind this card. */
  onBlocked: () => void;
}) {
  const { user } = useAuth();
  // One gate, read here and by the roll call's press that opens this card,
  // so the word and the way in cannot disagree. `isDemoIdentity` is the
  // predicate the real routes' session guards read, and the demo is handed
  // nothing: the adapter serves no block and no report, so a word there
  // would be a control whose only answer is a 404.
  const account = moderationTarget(member, {
    id: user?.id,
    demo: isDemoIdentity(user),
  });
  if (account === null) return null;
  return (
    <ModerationPanel
      tripId={tripId}
      userId={account}
      name={member.name}
      onBlocked={onBlocked}
    />
  );
}

/**
 * The word, and the panel it opens in its place.
 *
 * A report leaves one line where the panel was. A report changes nothing
 * the card shows — no fact moves, nobody leaves — so a panel that closed
 * on silence would read as a failure to send anything at all.
 */
function ModerationPanel({
  tripId,
  userId,
  name,
  onBlocked,
}: {
  tripId: string;
  userId: string;
  /** The person the word is read out by. */
  name: string;
  /** The block's own close. */
  onBlocked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);

  if (reported) {
    return (
      <Text className="font-body text-sm text-ink opacity-60">
        {REPORT_RECORDED_COPY}
      </Text>
    );
  }

  if (!open) {
    return (
      <QuietAction
        label="Report or block"
        // The word names the act and never the person it belongs to, and
        // the card around it is not something a reader walking the buttons
        // is given: the name is what says whose it is. It is the display
        // name — the one thing the card shows for everybody.
        ariaLabel={`Report or block ${name}`}
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <ModerationAnswers
      tripId={tripId}
      userId={userId}
      onCancel={() => setOpen(false)}
      onReported={() => {
        setReported(true);
        setOpen(false);
      }}
      onBlocked={onBlocked}
    />
  );
}

/**
 * The panel: the reason list, the note, and the two answers.
 *
 * The reasons come from `REPORT_REASONS` and their labels from
 * `REPORT_REASON_LABELS`, never from a list typed here: the vocabulary
 * lives in `shared` because the API validates its body against it, and a
 * fifth reason there is a fifth chip here with no edit.
 *
 * **Report and Block are two decisions, not one form with two
 * submits.** A report needs a reason and changes nothing the caller can
 * see; a block needs no reason and takes the person off the roll call,
 * because the server omits the blocked pair in both directions. So
 * Report is disabled until a reason is chosen, Block is available from
 * the start, and neither is a variant of the other.
 *
 * Block is `secondary`, never `danger`. `danger` is the colour for what
 * cannot be taken back, and a block is undone from the same route's
 * DELETE — the blocked list is where the undo lives, which is why the
 * word here is quiet rather than alarming.
 *
 * In flight, the acting button says what it is doing and both go quiet.
 * On failure the panel stays open, keeps the reason and the note, and
 * says what happened in an `InlineError` under the buttons: this app has
 * no toast, and a failure that closed the panel would take the reader's
 * own words with it.
 */
function ModerationAnswers({
  tripId,
  userId,
  onCancel,
  onReported,
  onBlocked,
}: {
  tripId: string;
  userId: string;
  /** The panel's own close, and the Cancel word's. */
  onCancel: () => void;
  /** The report's close, which leaves a line behind. */
  onReported: () => void;
  /** The block's close, which leaves the card behind too. */
  onBlocked: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const block = useBlockUser(tripId);
  const report = useReportUser(tripId);

  /**
   * One write, one in-flight state. `done` runs only on success: a block
   * dismisses the card whose subject has just left the roster, and a
   * report closes the panel onto the line above it.
   */
  async function write(
    action: ModerationAction,
    send: () => Promise<unknown>,
    done: () => void,
  ) {
    if (busy !== null) return;
    setBusy(action);
    setFailure(null);
    try {
      await send();
    } catch (caught) {
      setFailure(moderationFailureCopy(caught, action));
      setBusy(null);
      return;
    }
    done();
  }

  function reportThem() {
    if (reason === null) return;
    const words = note.trim();
    return write(
      "report",
      () =>
        report.mutateAsync({
          userId,
          reason,
          ...(words ? { note: words } : null),
        }),
      onReported,
    );
  }

  function blockThem() {
    return write("block", () => block.mutateAsync({ userId }), onBlocked);
  }

  return (
    <View className="gap-3">
      {/* One frame for two actions that are not one: a report goes to an
          admin, a block is between the two people. The reason below is the
          report's own — it means nothing to a block, which is why only
          `Report` is gated on it. */}
      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">
          Report or block
        </Text>
        <Text className="font-body text-sm text-ink opacity-60">
          A report goes to an admin. A block hides you from each other.
        </Text>
      </View>
      {/* The reasons are one answer out of four and not four filters, so
          the group says so and each chip announces it — the pair
          `Segmented` draws for the same choice. Chips rather than cells
          because four reasons wrap and `Segmented`'s row does not. */}
      <View
        className="flex-row flex-wrap gap-2"
        role="radiogroup"
        aria-label="Reason"
      >
        {REPORT_REASONS.map((value) => (
          <ChipToggle
            key={value}
            role="radio"
            label={REPORT_REASON_LABELS[value]}
            selected={reason === value}
            disabled={busy !== null}
            onPress={() => setReason(value)}
          />
        ))}
      </View>
      <TextField
        label="Note"
        value={note}
        onChangeText={setNote}
        placeholder="What happened?"
        multiline
        numberOfLines={3}
        maxLength={REPORT_NOTE_MAX}
      />
      {/* Both buttons stack, one per row. `Button`'s own note in the lab
          is explicit: no two content buttons side by side, at any width. */}
      <View className="gap-3">
        <Button
          title={busy === "report" ? moderationPendingLabel("report") : "Report"}
          disabled={reason === null || busy !== null}
          onPress={() => void reportThem()}
        />
        <Button
          title={busy === "block" ? moderationPendingLabel("block") : "Block"}
          variant="secondary"
          disabled={busy !== null}
          onPress={() => void blockThem()}
        />
      </View>
      {/* The guard is the panel's, and on its own it is invisible:
          `QuietAction` carries no disabled state, so the word keeps its
          press and the handler is what refuses it. The state is
          therefore announced around it, which is how `profile.tsx`'s
          calendar row and the trip page's RSVP control say the same
          thing — `role` because a state prop on an element that is not
          anything is a flag a reader is not obliged to read out. */}
      <View role="group" aria-busy={busy !== null}>
        <QuietAction
          label="Cancel"
          onPress={() => {
            if (busy === null) onCancel();
          }}
        />
      </View>
      {failure ? <InlineError message={failure} /> : null}
    </View>
  );
}
