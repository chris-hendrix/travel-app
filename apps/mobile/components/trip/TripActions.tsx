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
 * They were consolidated into a block of four boxes, and that is what
 * this replaces. Four boxes under a cover is four things to read before
 * you have read the trip, and the two permanent ones were a pair of
 * halves precisely because a column of full-width boxes reads as a menu
 * — an objection a trigger answers, because a trigger is what says a
 * menu is what it is.
 *
 * The trigger holds everything the page can be asked to do, and the two
 * halves it holds are not the same kind of thing:
 *
 *   the trip    Add event, Add stay, Add travel, Edit trip — authoring
 *               and maintaining the trip, which is the organizer's
 *   yours       Trip settings — every row of it is about you rather than
 *               about the trip (`app/trips/settings.tsx`: whether the
 *               digest and the messages reach you, whether the others can
 *               see your number, whether your calendar follows this trip)
 *
 * A rule separates them, because the box is the one place those two kinds
 * meet. The organizer gets the whole list; everybody else gets their own
 * travel while they still owe a time, then the same rule, then the same
 * settings. So the trigger is in the same place on the same page for
 * everybody and only its contents are keyed by role — the shape the travel
 * form already uses ("one screen for both verbs, and the same screen for
 * both roles").
 *
 * Trip settings is in the box for every member, and that is deliberate
 * even though the organizer's half of the box is not its kind: putting it
 * inside the traveler's box and outside the organizer's would put one
 * destination in two different places depending on who is looking, which
 * is worse than one box that is slightly broad.
 *
 * Invite people stays out, and loud. It is the growth loop, it is the one
 * accent box on the page, and a trip that nobody is invited to has nothing
 * else here to do.
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
  /** Your server-side role: organizers get the invitation and the trip's own verbs. */
  organizer: boolean;
  /**
   * Whether somebody still owes a time: yours, or the whole travelling
   * roster's when the viewer is the organizer. The screen computes it,
   * because only the screen knows whose travel the nudge is about.
   */
  travelOwed: boolean;
  /** Whose travel the form files — the viewer's own, since the row is theirs. */
  memberId?: string | undefined;
  /** The traveler's own ask — the RSVP control. Organizers get Invite people instead. */
  ask?: ReactNode;
}) {
  const router = useRouter();
  const travelHref = `/trips/travel/form?id=${tripId}&member=${memberId ?? ""}`;

  // The trip's own half of the box. Add travel joins the other two adds
  // rather than leading them as it did in the open block: shut, its
  // coming and going moves nothing, so it is free to sit with the verbs
  // it belongs with instead of holding a position it had to earn.
  const tripRows = organizer
    ? [
        { title: "Add event", href: `/trips/events/new?id=${tripId}` },
        { title: "Add stay", href: `/trips/stay/new?id=${tripId}` },
        ...(travelOwed ? [{ title: "Add travel", href: travelHref }] : []),
        { title: "Edit trip", href: `/trips/edit?id=${tripId}` },
      ]
    : travelOwed
      ? [{ title: "Add travel", href: travelHref }]
      : [];

  return (
    <View className="gap-3">
      {organizer ? (
        // The one loud control on the page. Watermelon, the accent role,
        // and the only filled box outside the trigger.
        <Button
          title="Invite people"
          variant="accent"
          fullWidth
          onPress={() => router.push(`/trips/invite?id=${tripId}`)}
        />
      ) : (
        ask
      )}

      <DisclosureButton title="Trip actions">
        {tripRows.map((row) => (
          <Button
            key={row.title}
            title={row.title}
            variant="secondary"
            fullWidth
            onPress={() => router.push(row.href)}
          />
        ))}
        {/* The seam between the trip's half and yours. Only drawn when
            there is something above it to be separated from: a traveler
            who owes nothing opens onto Trip settings alone, and a rule at
            the head of a single row is a rule about nothing. */}
        {tripRows.length > 0 ? (
          <View className="h-px w-full bg-ink" />
        ) : null}
        <Button
          title="Trip settings"
          variant="secondary"
          fullWidth
          onPress={() => router.push(`/trips/settings?id=${tripId}`)}
        />
      </DisclosureButton>
    </View>
  );
}
