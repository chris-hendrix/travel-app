import type { ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useHoverZoom } from "@/hooks/useHoverZoom";

/**
 * One row of the run: the place's photo at the left, the name under it,
 * a line of chips, and one fact at the right edge.
 *
 * Extracted because there are two kinds of row in the itinerary — an
 * event and a stay — and a copy each is a copy that drifts. The two
 * disagreed on the thumbnail's size, the name's size and the chip's size
 * within a day of being written, and none of those differences was a
 * decision: a row of this list is a row of this list. What differs
 * between the two is data and not design — which chips, and whether the
 * right-hand column holds a clock or a span — and that is all either
 * caller supplies.
 *
 * The zoom the card does under a pointer, done here too: the photo
 * inside its clipped frame. The text does not, and cannot — a card grows
 * into the grid's gutter, while a row spans the whole column, so the
 * same five per cent would push its title off the right edge.
 *
 * The whole row is the target, which is why there is no chevron: nothing
 * else in the run has one either.
 */
export function ScheduleRow({
  image,
  title,
  labels,
  fact,
  onPress,
}: {
  image: string;
  title: string;
  /** The chips under the name: what it is, then where. */
  labels: ReactNode;
  /** The right-hand column: a clock, or the span a stay covers. */
  fact: string;
  onPress?: (() => void) | undefined;
}) {
  const { hoverProps, zoom } = useHoverZoom();

  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      className="cursor-pointer flex-row flex-wrap items-center gap-4 border-b border-b-ink py-4"
    >
      <View className="overflow-hidden">
        <Image
          source={{ uri: image }}
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
          {title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-3">{labels}</View>
      </View>

      <Text className="w-full text-right font-body text-base text-ink md:w-auto">
        {fact}
      </Text>
    </Pressable>
  );
}
