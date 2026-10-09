import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { InlineError } from "@/components/ui/InlineError";
import { QuietAction } from "@/components/ui/QuietAction";
import { TextField } from "@/components/ui/TextField";
import { RosterList } from "@/components/trip/RosterList";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { isDemoIdentity, useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORT_RECORDED_COPY,
  moderationFailureCopy,
  moderationPendingLabel,
  moderatableUserId,
  type ModerationAction,
  type ReportReason,
} from "@/lib/moderation";
import { useMembers } from "@/lib/queries/members";
import {
  useBlockedUsers,
  useBlockUser,
  useReportUser,
  useUnblockUser,
} from "@/lib/queries/moderation";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTripInvitations } from "@/lib/queries/invitations";
import { rosterRows, type RosterRow } from "@/lib/roster";

/**
 * The roll call, reached from "6 going" on the trip header.
 *
 * A dialog rather than a screen: it is a disclosure of one line on the
 * screen behind it, which is why there is nothing to author here. The
 * one action the dialog does carry is the organizer's, and it is not
 * authoring this list either — it is the way to make it longer:
 * Invite people, which is also the trip screen's loudest button, and the
 * same screen whichever door you come through.
 *
 * The organizer is first and is labeled Organizing: the far column says
 * what each person's part in the trip is, and for the organizer that is
 * the job rather than the answer everyone else had to give. Going is
 * what an organizer is without being asked, so saying it would spend the
 * column on the one row that never chose.
 *
 * How much of a person you get is the API's decision, not this screen's:
 * an organizer sees every number, because they are running the trip and
 * someone has to be able to reach the group; a traveler sees the numbers
 * of the members who chose to share theirs. The account chips are on the
 * row for everyone — an Instagram is a thing you put out in public, and a
 * phone number is not, which is the whole reason only one of them is
 * gated.
 */
export default function TripMembers() {
  return (
    <TripGate label="Loading trip members">
      <TripMembersDialog />
    </TripGate>
  );
}

function TripMembersDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  // The roll call is server state now, suspended under the same gate
  // as the trip above — the dialog never renders without it.
  const { members } = useMembers(trip?.id);
  // Who you are comes from the server: your own roster row, matched
  // by account, carries your role — never a query param.
  const viewer = viewerOf(members, user?.id);
  const viewerIsOrganizer = viewer?.isOrganizer ?? false;
  // The traveler is handed no invitations, so `rosterRows` produces no
  // `invited` rows for them — the traveler variant falls out of the
  // `enabled` flag, not a filter. A traveler never reaches the person
  // dialog, so their rows stay plain views.
  const { invitations } = useTripInvitations(trip?.id, viewerIsOrganizer);
  const rows = rosterRows(members, invitations);
  // The people this viewer has blocked, read beside the roster rather than
  // inside it: the gate above is the roster's, and this must not be able to
  // add a second one. A plain query for the same reason (see the hook) — a
  // failure here is a block that draws nothing, not a screen that fails.
  const { blocked } = useBlockedUsers();
  // The undo's own write. The dialog does not render without a trip, so the
  // empty id is never the one a successful settle is pointed at.
  const unblock = useUnblockUser(trip?.id ?? "");
  // Which row is writing, rather than only that one is: the acting row says
  // what it is doing, and every other press is a no-op until it answers.
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [unblockFailure, setUnblockFailure] = useState<string | null>(null);

  /**
   * One write, one in-flight state. Success needs nothing here:
   * `useUnblockUser` invalidates the blocks key and the trip's people, so
   * the person leaves this list and their roster row comes back in one
   * settle.
   */
  async function unblockThem(userId: string): Promise<void> {
    if (unblockingId !== null) return;
    setUnblockingId(userId);
    setUnblockFailure(null);
    try {
      await unblock.mutateAsync({ userId });
    } catch (caught) {
      // The same shape `removeTrip` uses: the mapper's own sentence when it
      // has one, the offline one when the request never arrived, and the
      // act's own when the status says nothing (a 404). No toast.
      const copy = toErrorCopy(caught);
      setUnblockFailure(
        copy.offline
          ? "You're offline. Check your connection and try again."
          : (copy.message ?? "Couldn't unblock them."),
      );
    } finally {
      setUnblockingId(null);
    }
  }

  if (!trip) {
    return <NotFound />;
  }

  /**
   * The row's second target, and who is handed it.
   *
   * The demo visitor is handed nothing at all. This screen is inside the
   * demo's own scope and the adapter serves its roster read, so every row
   * comes back with an account behind it — but no block and no report is
   * served there, and each row would carry a word whose only answer is a
   * 404. A control that always fails is worse than one that is not there,
   * which is the sentence `app/profile.tsx` gates its own door on, and
   * `isDemoIdentity` is the predicate the real routes' session guards
   * already read. Nothing else about the demo's roster changes: this is
   * one control the demo cannot answer for, not a doubt about the viewer.
   */
  const moderationFooter = isDemoIdentity(user)
    ? undefined
    : (row: RosterRow) => (
        <RowModeration row={row} tripId={trip.id} viewerId={user?.id} />
      );

  return (
    <FullscreenDialog
      title="Who's coming"
      // The traveler gets no bar at all: an action bar with nothing in it
      // is chrome, and there is nothing here a traveler may do.
      primaryTitle={viewerIsOrganizer ? "Invite people" : undefined}
      onPrimary={
        viewerIsOrganizer
          ? () =>
              router.push(`/trips/invite?id=${trip.id}&from=members`)
          : undefined
      }
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      {/* A table: each row is read across — a name, the accounts you can
          reach them on, the part they play — so the rows keep one soft
          rule between them, from `RuledRows`. The first row has none: the
          header above already closes the top of this list with its own
          edge, and a rule under that would be a second mark for one
          boundary. What went with the gravel is the rule *under* the last
          row, which duplicated nothing above it. The part each person
          plays sits at the far edge so the column can be read down. */}
      <RosterList
        rows={rows}
        viewerIsOrganizer={viewerIsOrganizer}
        viewerMemberId={viewer?.id ?? null}
        // The dialog reads the viewer's answer off the roster, so this
        // is the roster's own word handed back: an organizer keeps the
        // roster's label (their row says Organizing, never an answer).
        viewerAnswer={
          viewer && !viewer.isOrganizer ? viewer.status : null
        }
        // The press the lift took out of the row. An organizer's row
        // opens the person dialog and everybody else gets the row
        // alone, which is what this screen has always done: the
        // permission picks the render, not the row's own measure.
        onPressRow={
          viewerIsOrganizer
            ? (row) =>
                router.push(
                  row.kind === "invited"
                    ? `/trips/members/detail?id=${trip.id}&invite=${row.invitationId}`
                    : `/trips/members/detail?id=${trip.id}&member=${row.member.id}`,
                )
            : undefined
        }
        // The row's second target, under it. It is this screen's to
        // supply for the same reason the press is: reporting and
        // blocking are anybody's, not the organizer's, and the panel
        // needs the trip and the viewer — both of which the dialog
        // holds. A row with nobody to moderate draws nothing.
        renderRowFooter={moderationFooter}
      />
      {/* Under the list, not in the bar: adding a guest lengthens the
          roll call rather than inviting, which is what the bar is for.
          A described block in the shape the person dialog's own Manage
          sections take, since it is the same kind of thing: one action
          with its reason. The traveler gets nothing here — there is
          nothing a traveler may do. */}
      {viewerIsOrganizer ? (
        <View className="gap-2 pt-6">
          <Text className="font-body-bold text-base text-ink">
            Add a guest
          </Text>
          <Text className="font-body text-sm text-ink opacity-60">
            Plan for them without inviting them.
          </Text>
          <Button
            title="Add a guest"
            variant="secondary"
            onPress={() => router.push(`/trips/members/new?id=${trip.id}`)}
          />
        </View>
      ) : null}
      {/* The undo, under the list it takes people off. It cannot live on
          the roster row: the server omits the blocked pair's rows in both
          directions, so the person you blocked has no row here and no panel
          to open — an Unblock in that panel would be a control nothing can
          reach. The list the server keeps is the surface that is actually
          reachable, and this is where it belongs: under the roll call,
          after the organizer's own block above.

          For every viewer, never only the organizer: blocking is offered on
          every member's row, so the undo is not a permission either.

          A block is account-wide, not trip-wide — the server filters the
          pair on every trip — which is the one thing this screen can say
          that the trip the block happened on cannot. Mirrored from "Add a
          guest" above, plain `View`s, so it costs the rule census nothing.

          Nothing at all while the read is loading, when it failed, and when
          there is nobody blocked: a heading over an empty list claims you
          have blocked nobody, and a read that never answered has not earned
          that. `app/admin/users/detail.tsx` says the same about its own
          reports block. */}
      {blocked.length > 0 ? (
        <View className="gap-2 pt-6">
          <Text className="font-body-bold text-base text-ink">Blocked</Text>
          <Text className="font-body text-sm text-ink opacity-60">
            A block hides you from each other. It holds on every trip, not just
            this one.
          </Text>
          {blocked.map((person) => {
            // One word, read twice: the control's visible label and the
            // name it is announced by are the same word plus the person.
            // The in-flight word is the mapper's, so a reader who cannot
            // see the button still hears that the write is running.
            const word =
              unblockingId === person.userId
                ? moderationPendingLabel("unblock")
                : "Unblock";
            return (
              <View
                key={person.userId}
                className="flex-row items-center justify-between gap-4"
              >
                <Text className="font-body text-base text-ink">
                  {person.displayName}
                </Text>
                {/* `QuietAction` carries no `disabled`, so the press is
                    guarded and the word changes — the panel's own Cancel
                    pattern. Two taps must not be two DELETEs. */}
                <QuietAction
                  label={word}
                  // The name lives in a sibling `Text`, so the word on its
                  // own says which act and never whose list it is in.
                  ariaLabel={`${word} ${person.displayName}`}
                  onPress={() => {
                    if (unblockingId === null) void unblockThem(person.userId);
                  }}
                />
              </View>
            );
          })}
          {unblockFailure ? <InlineError message={unblockFailure} /> : null}
        </View>
      ) : null}
    </FullscreenDialog>
  );
}

/**
 * The row's own action, gated before anything draws.
 *
 * The gate cannot live in the row: `RosterList` hands the footer to every
 * row it draws, and three of those rows have nobody to moderate — an
 * invitation is a phone number and not a person, a guest has no account
 * behind them, and you cannot report or block yourself. `moderatableUserId`
 * is where that is decided, in one pure place, and a row that gets `null`
 * back draws nothing at all rather than a control the API would refuse.
 */
function RowModeration({
  row,
  tripId,
  viewerId,
}: {
  row: RosterRow;
  tripId: string;
  /** The signed-in account, or undefined when the app has not resolved
   *  one. A row needs it to tell its own account from another's. */
  viewerId: string | undefined;
}) {
  const account = moderatableUserId(row, viewerId);
  // The gate only ever answers for a person's row, which is where the name
  // this control is announced by comes from — the kind is read again so
  // TypeScript can see the member behind the account.
  if (account === null || row.kind !== "person") return null;
  return (
    <MemberModeration tripId={tripId} userId={account} name={row.member.name} />
  );
}

/**
 * The row's two quiet actions, and the panel they open.
 *
 * A person's row already carries one door — the press that opens their
 * dialog — and this is a second target that leads nowhere: reporting
 * somebody and blocking them are said *about* a row rather than in it,
 * and a third column of controls would turn the roll call into a list of
 * buttons wearing people's names. A word under the name is the shape the
 * app already gives the quiet things.
 *
 * One state, one control: opening the panel replaces the word with the
 * panel, and the panel carries its own Cancel, so the two are never both
 * on screen.
 *
 * The panel expands in place rather than opening a dialog. This screen is
 * already a `FullscreenDialog`, and the house pattern for a question
 * inside a block is the same expansion — `profile.tsx`'s `confirming` and
 * the armed delete in `app/trips/edit.tsx`. A second surface over the
 * roster would be a dialog on a dialog.
 */
function MemberModeration({
  tripId,
  userId,
  name,
}: {
  tripId: string;
  userId: string;
  /** The person the row's word is read out by. */
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);

  // A report leaves one line where the panel was. A report changes
  // nothing the roster shows — no row moves — so a panel that closed on
  // silence would read as a failure to send anything at all.
  if (reported) {
    return (
      <Text className="pb-3 font-body text-sm text-ink opacity-60">
        {REPORT_RECORDED_COPY}
      </Text>
    );
  }

  if (!open) {
    return (
      <QuietAction
        label="Report or block"
        // The word is drawn once per moderatable row, so on its own it names
        // the act and never the person: a reader walking the roster hears
        // the same button four times with nothing saying whose row it is on.
        // The name is the display name — the one thing the row shows for
        // everybody, never a handle or a number the row withholds.
        ariaLabel={`Report or block ${name}`}
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <ModerationPanel
      tripId={tripId}
      userId={userId}
      onDone={() => setOpen(false)}
      onReported={() => {
        setReported(true);
        setOpen(false);
      }}
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
 * DELETE — the blocked list is Task 35's screen, and this is why the word
 * under it is quiet rather than alarming.
 *
 * In flight, the acting button says what it is doing and both go quiet.
 * On failure the panel stays open, keeps the reason and the note, and
 * says what happened in an `InlineError` under the buttons: this app has
 * no toast, and a failure that closed the panel would take the reader's
 * own words with it.
 */
function ModerationPanel({
  tripId,
  userId,
  onDone,
  onReported,
}: {
  tripId: string;
  userId: string;
  /** The block's own close, and the Cancel word's. */
  onDone: () => void;
  /** The report's close, which leaves a line behind. */
  onReported: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const block = useBlockUser(tripId);
  const report = useReportUser(tripId);

  /**
   * One write, one in-flight state. `done` runs only on success: a block
   * closes the panel and lets the invalidated roster do the confirming,
   * and a report closes it onto the line above.
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
    return write("block", () => block.mutateAsync({ userId }), onDone);
  }

  return (
    <View className="gap-3 pb-3">
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
            if (busy === null) onDone();
          }}
        />
      </View>
      {failure ? <InlineError message={failure} /> : null}
    </View>
  );
}
