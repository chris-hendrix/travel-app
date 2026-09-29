import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { DisclosureButton } from "@/components/ui/DisclosureButton";

/**
 * Every verb the trip page has, in one block under the cover.
 *
 *   ask       one control   who you are decides it: the organizer's
 *                           invitation, everyone else's own RSVP
 *   actions   one trigger   everything the trip page can be asked to do
 *
 * One place, because the alternative was three. The adds were split: Add
 * travel sat in the stack under the cover, Add event and Add stay in the
 * itinerary's own head, and Add the first event was a third copy for as
 * long as the run was empty and that head was below the fold. Three homes
 * for one family of verbs, two conventions between them, and a nudge that
 * moved the boxes under it every time it appeared and vanished.
 *
 * They were consolidated into a block of four boxes, and that is what this
 * replaces. Four boxes under a cover is four things to read before you
 * have read the trip, and the two permanent ones were a pair of halves
 * precisely because a column of full-width boxes reads as a menu — an
 * objection a trigger answers, because a trigger is what says a menu is
 * what it is.
 *
 * The trigger is a box rather than a fill, and the one filled control on
 * the page is the invitation above it. That is the block's shape for both
 * roles: one control in the ask slot — the organizer's invitation, the
 * traveler's RSVP — with the trigger under it.
 *
 * The invitation was a row inside the trigger for a while, on the argument
 * that a shut box holding everything is the calmest page. It is out again,
 * because the fill is this system's mark for the control that finishes a
 * job and a container that reveals is not one: a page whose only loud thing
 * is a menu has put its action behind its navigation.
 *
 * What the rows hold is not all one kind of thing, and the order is what
 * says so rather than a rule between them:
 *
 *   the trip    Add event, Add stay, Add travel, Edit trip
 *   yours       Trip settings — every row of it is about you rather than
 *               about the trip (`app/trips/settings.tsx`: whether the
 *               digest and the messages reach you, whether the others can
 *               see your number, whether your calendar follows this trip)
 *
 * A rule between the two was tried and taken out. The list is short, and a
 * line inside it was a third element competing with the rules the rows
 * already carry; the last position carries the split well enough, which is
 * where `Edit trip` and `Trip settings` already sat before any of this.
 *
 * Trip settings is in the box for every member, and that is deliberate
 * even though the organizer's half of the list is not its kind: putting it
 * inside the traveler's box and outside the organizer's would put one
 * destination in two different places depending on who is looking, which
 * is worse than one box that is slightly broad.
 *
 * Add travel is the one row whose presence is a question rather than a
 * fixture — it is there while somebody still owes a time and goes when
 * nobody does — and whose times it is about is the caller's (`travelOwed`,
 * computed off the travelling roster in `app/trips/detail.tsx`), because
 * the answer differs by role: yours, or the whole group's if you are the
 * one who files for them. Inside a shut box that costs nothing: the page
 * does not move while it comes and goes, which was the whole complaint
 * about it in the open.
 *
 * `ask` arrives as a node rather than as RSVP props because the block
 * does not own the answer: the trip page does, off the roster, painted
 * optimistically and rolled back on failure.
 */
export function TripActions({
  tripId,
  organizer,
  travelOwed,
  memberId,
  ask,
}: {
  tripId: string;
  /** Your server-side role: organizers get the trip's own verbs. */
  organizer: boolean;
  /**
   * Whether somebody still owes a time: yours, or the whole travelling
   * roster's when the viewer is the organizer. The screen computes it,
   * because only the screen knows whose travel the nudge is about.
   */
  travelOwed: boolean;
  /** Whose travel the form files — the viewer's own, since the row is theirs. */
  memberId?: string | undefined;
  /**
   * The traveler's own ask — the RSVP control. An organizer is not offered
   * one here: the server reads them the full trip whatever they answered,
   * so their answer is about the roster rather than about access.
   */
  ask?: ReactNode;
}) {
  const router = useRouter();
  const travelHref = `/trips/travel/form?id=${tripId}&member=${memberId ?? ""}`;
  const openTravel = () => router.push(travelHref);

  // The trip's own rows. Add travel joins the other two adds rather than
  // leading them as it did in the open block: shut, its coming and going
  // moves nothing, so it is free to sit with the verbs it belongs with
  // instead of holding a position it had to earn.
  const tripActions = organizer
    ? [
        {
          title: "Add event",
          onPress: () => router.push(`/trips/events/new?id=${tripId}`),
        },
        {
          title: "Add stay",
          onPress: () => router.push(`/trips/stay/new?id=${tripId}`),
        },
        ...(travelOwed ? [{ title: "Add travel", onPress: openTravel }] : []),
        {
          title: "Edit trip",
          onPress: () => router.push(`/trips/edit?id=${tripId}`),
        },
      ]
    : travelOwed
      ? [{ title: "Add travel", onPress: openTravel }]
      : [];

  return (
    <View className="gap-3">
      {organizer ? (
        // The one loud control on the page: watermelon, the accent role, and
        // the only filled box. It is the organizer's ask — the trip is
        // authored, so the ask is bringing people in — which is what keeps
        // this block the same shape for both roles.
        <Button
          title="Invite people"
          variant="accent"
          fullWidth
          onPress={() => router.push(`/trips/invite?id=${tripId}`)}
        />
      ) : (
        ask
      )}

      <DisclosureButton
        title="Trip actions"
        actions={[
          ...tripActions,
          {
            title: "Trip settings",
            onPress: () => router.push(`/trips/settings?id=${tripId}`),
          },
        ]}
      />
    </View>
  );
}
