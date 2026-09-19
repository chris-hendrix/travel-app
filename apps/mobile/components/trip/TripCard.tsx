import { useState, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useWideHover } from "@/hooks/useWideHover";
import { formatDateRange } from "@/lib/dateRange";

export type Trip = {
  id: string;
  title: string;
  location: string;
  image: string;
  going: number;
  /** ISO yyyy-mm-dd — the card formats its own range. */
  startDate: string;
  endDate: string;
};

/**
 * A trip in a grid. Floats on the page background — no card fill, no
 * border, no shadow; the photo and the type carry it.
 *
 * Order follows the calendar convention: date, then title, then place.
 * The going count rides on the photo, so it is the one colour anchor.
 *
 * Fixed width (capped at 420px, full width on a phone) with a 2:1 photo
 * and a two-line title slot. Nothing reserves empty height: the card
 * floats on the page with no fill, so a ragged bottom edge is invisible
 * and the location can sit right under the title.
 *
 * Hover (web, wide only): the photo and the text both zoom — the photo
 * inside its clipped frame, the text scaling from its left edge so it
 * grows into the grid gap rather than over the neighbouring card.
 */
export function TripCard({
  trip,
  onPress,
}: {
  trip: Trip;
  onPress?: () => void;
}) {
  const canHover = useWideHover();
  const [hovering, setHovering] = useState(false);
  const hovered = canHover && hovering;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovering(true)}
      onHoverOut={() => setHovering(false)}
      aria-label={trip.title}
      className="w-full max-w-[420px] cursor-pointer"
    >
      <View className="relative overflow-hidden">
        <Image
          source={{ uri: trip.image }}
          resizeMode="cover"
          className={`w-full aspect-[2/1] transition-transform duration-200 ease-out ${
            hovered ? "scale-105" : "scale-100"
          }`}
        />
        <View className="absolute left-3 top-3 rounded-full bg-watermelon px-3 py-1">
          <Text className="font-body-bold text-sm text-ink">
            {trip.going} going
          </Text>
        </View>
      </View>

      <View
        className={`origin-left transition-transform duration-200 ease-out ${
          hovered ? "scale-105" : "scale-100"
        }`}
      >
        <Text numberOfLines={1} className="mt-3 font-body-bold text-lg text-ink">
          {formatDateRange(trip.startDate, trip.endDate)}
        </Text>
        <Text
          numberOfLines={2}
          className="mt-1 font-display text-4xl uppercase leading-[1.05] text-ink"
        >
          {trip.title}
        </Text>
        <Text numberOfLines={1} className="mt-2 font-body-bold text-lg text-ink">
          {trip.location}
        </Text>
      </View>
    </Pressable>
  );
}

export function TripGrid({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row flex-wrap gap-x-6 gap-y-8">{children}</View>
  );
}
