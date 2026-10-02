import type { ReactNode } from "react";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useMotion } from "@/hooks/useMotion";
import { imageSlot } from "@/lib/place-images";

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
 * A 404 is a state, not a blank box: a photo that fails to load
 * falls back to the kind's stock photo, same as a missing one.
 *
 * The card's press, on a row. The row is the target, so the whole row is
 * what moves — the photo inside its clipped frame goes with it, and the
 * title does too, which is the difference between this and a card: a card
 * grows into the grid's gutter, while a row spans the whole column, so
 * there is nothing beside it to grow into. The scale is the same five per
 * cent the card uses, because two press scales a hair apart is the kind
 * of difference a thumb reads as a bug.
 *
 * The whole row is the target, which is why there is no chevron: nothing
 * else in the run has one either.
 */
export function ScheduleRow({
  image,
  placeholder,
  title,
  labels,
  fact,
  onBand = false,
  onPress,
}: {
  image: string | null;
  /** The kind's stock photo rendered when there is no photo, or it failed to load. */
  placeholder: ReactNode;
  title: string;
  /** The chips under the name: what it is, then where. */
  labels: ReactNode;
  /** The right-hand column: a clock, or the span a stay covers. */
  fact: string;
  /**
   * Whether this row sits on a band rather than on sand.
   *
   * The right-hand column is the run's scannable data, so it wears the
   * palette's deep *text* tier rather than ink — the tier Phase 1 built for
   * exactly this and nobody had spent. On a band it cannot: the palette's
   * floors are declared against sand, gravel and paper only, and
   * `baltic-deep` — the token written for "a mark on a baltic band" —
   * measures **4.04:1** there, under the 4.5:1 body-text bar. So a band's
   * rows keep ink, and this flag is why the tone is not simply inherited.
   */
  onBand?: boolean;
  onPress?: (() => void) | undefined;
}) {
  const motion = useMotion();
  const [failed, setFailed] = useState(false);
  const slot = imageSlot({ image, failed });

  return (
    <Pressable
      onPress={onPress}
      className={`cursor-pointer flex-row flex-wrap items-center gap-4 border-b border-b-ink py-4 ${motion.press}`}
    >
      <View className="overflow-hidden">
        {slot.kind === "placeholder" ? (
          <View className="h-14 w-14">{placeholder}</View>
        ) : (
          <Image
            source={{ uri: slot.url }}
            resizeMode="cover"
            onError={() => setFailed(true)}
            className="h-14 w-14"
          />
        )}
      </View>

      {/* The time is the row's third column, not a rider on the title's
          baseline — it reads better centred against the whole block. On
          a phone there is no room for a third column, so it takes its
          own line and keeps the right edge. */}
      <View className="flex-1 gap-3">
        <Text className="font-display-bold text-display-sm uppercase text-ink">
          {title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-3">{labels}</View>
      </View>

      <Text
        className={`w-full text-right font-body text-base md:w-auto ${
          onBand ? "text-ink" : "text-amethyst-deep"
        }`}
      >
        {fact}
      </Text>
    </Pressable>
  );
}
