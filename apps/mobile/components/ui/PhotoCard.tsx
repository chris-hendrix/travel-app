import { type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useHoverZoom } from "@/hooks/useHoverZoom";

/**
 * The floating tile: a 2:1 photo with an optional overlay, then a bold
 * line, a display title, and a bold line. It floats on the page — no
 * fill, no border, no shadow — and is fixed width (capped at 420px, full
 * width on a phone) with a two-line title slot, so a ragged bottom edge
 * is invisible and the last line can hug the title.
 *
 * Nothing reserves empty height. That is why the two cards built on this
 * — a trip and an event — can drop a line without the grid going wonky.
 *
 * Hover (web, wide only): the photo and the text both zoom — the photo
 * inside its clipped frame, the text from its left edge so it grows into
 * the grid gap rather than over the neighbouring card.
 */
export function PhotoCard({
  image,
  overlay,
  meta,
  title,
  footnote,
  onPress,
}: {
  image: string;
  /** Sits on the photo, top left: a countdown, a category, a state.
   *  The card places it; the chip does not place itself. */
  overlay?: ReactNode;
  /** The bold line above the title: a date, a time. */
  meta: string;
  title: string;
  /** The bold line under the title: where it is. */
  footnote?: string | undefined;
  onPress?: (() => void) | undefined;
}) {
  const { hoverProps, zoom } = useHoverZoom();

  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      aria-label={title}
      className="w-full max-w-[420px] cursor-pointer"
    >
      <View className="relative overflow-hidden">
        <Image
          source={{ uri: image }}
          resizeMode="cover"
          className={`w-full aspect-[2/1] ${zoom}`}
        />
        {overlay ? (
          <View className="absolute left-3 top-3">{overlay}</View>
        ) : null}
      </View>

      <View className={`origin-left ${zoom}`}>
        <Text numberOfLines={1} className="mt-3 font-body-bold text-lg text-ink">
          {meta}
        </Text>
        <Text
          numberOfLines={2}
          className="mt-1 font-display text-4xl uppercase leading-[1.05] text-ink"
        >
          {title}
        </Text>
        {footnote ? (
          <Text
            numberOfLines={1}
            className="mt-2 font-body-bold text-lg text-ink"
          >
            {footnote}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
