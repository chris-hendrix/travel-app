import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { QuietAction } from "@/components/ui/QuietAction";
import { RosterList } from "@/components/trip/RosterList";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { isDemoIdentity, useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { moderationPendingLabel, moderationTarget } from "@/lib/moderation";
import { useMembers } from "@/lib/queries/members";
import { useBlockedUsers, useUnblockUser } from "@/lib/queries/moderation";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTripInvitations } from "@/lib/queries/invitations";
import { rosterRows } from "@/lib/roster";

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
        // The press the lift took out of the row, decided per row. An
        // organizer opens every card: a person's, and the two that are
        // management — a guest's and an invitation's. A traveler's card is
        // the person's, because that is where report and block live and
        // those are anybody's — and it opens exactly where that card has
        // something to say, which is `moderationTarget`'s answer: a guest
        // has no account behind them to name, and the demo is served
        // neither word. So a traveler's guest row, and every row the demo
        // draws, comes back plain rather than a button onto the
        // organizer's refusal. The permission picks the render, not the
        // row's own measure.
        onPressRow={(row) => {
          if (row.kind === "invited") {
            return viewerIsOrganizer
              ? () =>
                  router.push(
                    `/trips/members/detail?id=${trip.id}&invite=${row.invitationId}`,
                  )
              : undefined;
          }
          const opens =
            viewerIsOrganizer ||
            moderationTarget(row.member, {
              id: user?.id,
              demo: isDemoIdentity(user),
            }) !== null;
          return opens
            ? () =>
                router.push(
                  `/trips/members/detail?id=${trip.id}&member=${row.member.id}`,
                )
            : undefined;
        }}
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
          the person's own card: the server omits the blocked pair's rows in
          both directions, so the person you blocked has no row here and no
          card to open — an Unblock there would be a control nothing can
          reach. The list the server keeps is the surface that is actually
          reachable, and this is where it belongs: under the roll call.

          For every viewer, never only the organizer: a block is anybody's
          (the word is on every account-backed member's card,
          `components/trip/ReportOrBlock.tsx`), so the undo is not a
          permission either.

          A block is account-wide, not trip-wide — the server filters the
          pair on every trip — which is the one thing this screen can say
          that the card the block happened on cannot. Mirrored from "Add a
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
