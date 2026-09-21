import { Text, View } from "react-native";
import { PlaceLink } from "@/components/ui/PlaceLink";
import { formatDateRange } from "@/lib/dateRange";

/**
 * The trip, as somebody who has not signed in reads it: the four facts
 * the API's invitation preview returns, and nothing else.
 *
 * It is the same order the trip page's own column uses — the dates, the
 * name in the display face, the place as a link out — because this is
 * that page seen through a keyhole, and a reader who joins should find
 * the thing they were shown rather than a rearrangement of it.
 *
 * No itinerary, no roll call, no cover. Those are what joining is for,
 * and the preview endpoint does not send them: what it sends is who
 * asked, where, and when, which is enough to decide.
 */
export function InviteCard({
  inviterName,
  tripName,
  destination,
  startDate,
  endDate,
}: {
  /** The organizer, as the API's `inviterName`. */
  inviterName: string;
  tripName: string;
  destination: string;
  /** ISO yyyy-mm-dd, or null when nobody has set the dates yet. */
  startDate: string | null;
  endDate: string | null;
}) {
  return (
    <View className="gap-4">
      <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
        Invitation
      </Text>
      <View className="gap-2 border-t border-ink pt-4">
        {startDate ? (
          <Text className="font-body-bold text-lg text-ink">
            {formatDateRange(startDate, endDate ?? startDate)}
          </Text>
        ) : null}
        <Text className="font-display text-5xl uppercase leading-[0.95] text-ink">
          {tripName}
        </Text>
        <PlaceLink label={destination} query={`${destination} ${tripName}`} />
        <Text className="font-body text-base text-ink">
          {inviterName} invited you.
        </Text>
      </View>
    </View>
  );
}
