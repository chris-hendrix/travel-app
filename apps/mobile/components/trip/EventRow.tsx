import { Image, Pressable, Text, View } from "react-native";
import { useHoverZoom } from "@/hooks/useHoverZoom";
import { Badge } from "@/components/ui/Badge";
import {
  EVENT_TYPE_LABEL,
  eventTimeLabel,
  type ItineraryEvent,
} from "@/lib/itinerary";

/**
 * An event in the list: a row of the schedule rather than a card.
 *
 * The reference's columns with our facts in them — the name in the
 * display face with its chips underneath, the time centred on the row's
 * own right-hand column. No date column: the day a row belongs to is the
 * heading it sits under, which is what stops "Today" appearing three
 * times in a column.
 *
 * The one thing it borrows from the card instead: a square of the
 * place's photo at the left. The row is already tall enough for it, so
 * it costs no space, and it gives the eye a spine to find a row by on
 * the way back up a long day. Square, because the photo is 2:1 and a
 * wide thumbnail would be a smudge fighting the title's line height.
 *
 * Only a bottom rule, so the rows read as one continuous table.
 *
 * The thumbnail zooms under a pointer, the way the card's photo does.
 * The text does not, and cannot: a card grows into the grid's 24px
 * gutter, while a row spans the whole column, so the same 5% would push
 * its title past the right edge.
 */
export function EventRow({
  event,
  timeZone = null,
  onPress,
}: {
  event: ItineraryEvent;
  /** Whose clock to read the times on; the device's when null. */
  timeZone?: string | null;
  onPress?: () => void;
}) {
  const { hoverProps, zoom } = useHoverZoom();

  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      aria-label={event.name}
      className="cursor-pointer flex-row flex-wrap items-center gap-4 border-b border-b-ink py-4"
    >
      <View className="overflow-hidden">
        <Image
          source={{ uri: event.image }}
          resizeMode="cover"
          className={`h-14 w-14 ${zoom}`}
        />
      </View>

      {/* The time is the row's third column, not a rider on the title's
          baseline — it reads better centred against the whole block. On
          a phone there is no room for a third column, so it takes its
          own line and keeps the right edge. */}
      <View className="flex-1 gap-3">
        <Text className="font-display text-3xl uppercase leading-[1.05] text-ink">
          {event.name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-3">
          <Badge label={EVENT_TYPE_LABEL[event.type]} variant="category" />
          <Badge label={event.place} variant="venue" />
        </View>
      </View>

      <Text className="w-full text-right font-body text-base text-ink md:w-auto">
        {eventTimeLabel(event, timeZone)}
      </Text>
    </Pressable>
  );
}
