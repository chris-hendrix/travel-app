import { Text, View } from "react-native";

/**
 * The itinerary, for a member the server will not read it to.
 *
 * Full trip data needs a Going answer on the server
 * (`canViewFullTrip`, apps/api/src/controllers/event.controller.ts), so a
 * member who has not answered gets this in place of the itinerary rather
 * than a section that fails with a 403. It points at the control above
 * instead of repeating it, and says "itinerary" rather than this codebase's
 * "run", which is a production term no traveller uses.
 *
 * The face is named. `text-heading-md` alone is a size, not a family, so
 * this heading used to paint the platform's fallback while every other
 * heading in the app painted `SpaceMono_700Bold`.
 */
export function RunLocked() {
  return (
    <View>
      <Text className="font-body-bold text-heading-md text-ink">
        Answer above to see the itinerary
      </Text>
    </View>
  );
}
