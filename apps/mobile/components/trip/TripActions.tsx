import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";

/**
 * A cell of the adds block: the whole width of the block on its own, half
 * of it when it shares a row with its twin.
 */
function Add({
  title,
  onPress,
  half = false,
}: {
  title: string;
  onPress: () => void;
  half?: boolean;
}) {
  const button = (
    <Button
      title={title}
      variant="secondary"
      fullWidth
      onPress={onPress}
    />
  );
  return half ? <View className="flex-1">{button}</View> : button;
}

/**
 * Every verb the trip page has, in one block under the cover, in two
 * tiers.
 *
 *   ask     one control   who you are decides it: the organizer's
 *                         invitation, everyone else's own RSVP
 *   adds    one block     Add travel on its own line while anybody still
 *                         owes a time, then Add event and Add stay
 *                         side by side for the organizer
 *
 * One place, because the alternative was three. The adds were split: Add
 * travel sat in the stack under the cover, Add event and Add stay in the
 * itinerary's own head, and Add the first event was a third copy for as
 * long as the run was empty and that head was below the fold. Three homes
 * for one family of verbs, two conventions between them, and a nudge that
 * moved the boxes under it every time it appeared and vanished.
 *
 * Two tiers and not three: the trip's own maintenance — Trip details, Trip
 * settings — used to close this block, and it moved up the page to sit
 * under the description it edits, with the rule that opens the run under
 * it. It was never one of these verbs (nothing here adds anything), and
 * last place in a column of boxes gave it the weight of a thing to do.
 *
 * Travel leads, and has a line to itself. It is the one of the two that
 * is a question rather than a standing verb — it appears while somebody
 * still owes a time and goes when nobody does — so it is the thing to do
 * first and the thing to read first, and a half-width cell in a row would
 * bury it beside two permanent ones. Whose times it is about is the
 * caller's (`travelOwed`, computed off the travelling roster in
 * `app/trips/detail.tsx`), because the answer differs by role: yours, or
 * the whole group's if you are the one who files for them.
 *
 * Event and stay are a pair of halves under it, and they are fixtures:
 * authoring the run is never finished, so they are always in the same
 * place. They share a row rather than each taking one, because a pair of
 * equal halves reads as one control with two verbs, where a column of
 * full-width boxes reads as a menu.
 *
 * They are boxes rather than words because they are the most-used verbs
 * on this screen — the itinerary head tried them as words first, and an
 * underlined label in a head read as a link in a paragraph.
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
  // An organizer can always author; a member has anything to add only
  // while they owe a time.
  const canAdd = organizer || travelOwed;

  return (
    <View className="gap-3">
      {organizer ? (
        // The one loud control on the page. Watermelon, the accent role,
        // and the only filled box in the block.
        <Button
          title="Invite people"
          variant="accent"
          fullWidth
          onPress={() => router.push(`/trips/invite?id=${tripId}`)}
        />
      ) : (
        ask
      )}

      {canAdd ? (
        <View className="gap-2">
          {travelOwed ? (
            <Add
              title="Add travel"
              onPress={() =>
                router.push(
                  `/trips/travel/form?id=${tripId}&member=${memberId ?? ""}`,
                )
              }
            />
          ) : null}
          {organizer ? (
            <View className="flex-row gap-2">
              <Add
                half
                title="Add event"
                onPress={() => router.push(`/trips/events/new?id=${tripId}`)}
              />
              <Add
                half
                title="Add stay"
                onPress={() => router.push(`/trips/stay/new?id=${tripId}`)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
