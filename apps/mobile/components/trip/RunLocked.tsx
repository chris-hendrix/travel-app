import { Text, View } from "react-native";

/**
 * The run, for a member the server will not read it to.
 *
 * Full trip data needs a Going answer on the server
 * (`canViewFullTrip`, apps/api/src/controllers/event.controller.ts), so
 * a member who has not answered gets this in place of the run rather
 * than a section that fails with a 403. The screen's own opinion used to
 * be the opposite — the itinerary readable before anybody answers, on
 * the rule that trip-level things are the organizer's to author and
 * everyone's to read — and the server's rule is the one that holds
 * today. When that changes, this state goes with it rather than turning
 * into a second empty state.
 *
 * It states the rule instead of hiding the section, because a run that is
 * simply absent reads as a trip with nothing in it. The words use the
 * answering control's own ("going"), so the instruction and the thing to
 * press agree, and they point at it rather than repeating it: the RSVP
 * control sits above this, under the cover.
 *
 * The same frame as the run's other states — a rule, a display heading
 * for the fact, body copy for what to do about it.
 */
export function RunLocked() {
  return (
    <View className="gap-1 border-t border-ink pt-6">
      <Text className="font-display text-xl uppercase leading-none text-ink">
        The run opens when you are going
      </Text>
      <Text className="font-body text-base text-ink">
        Answer above to read it.
      </Text>
    </View>
  );
}
