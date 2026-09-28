import { type ReactNode, useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { useHoverZoom } from "@/hooks/useHoverZoom";
import { INK } from "@/lib/theme";
import { imageSlot } from "@/lib/place-images";

/**
 * The floating tile: a 2:1 photo with an optional overlay, then a bold
 * line, a display title, and a bold line. It floats on the page — no
 * fill, no border, no shadow — and fills the column it is in, capped at
 * 420px once the page reaches its wide column. The cap is the grid's, not
 * the card's: two 420px tiles and the 24px gap are exactly the 864px
 * inner width of the widest column, so `lg` is where the cap belongs. It
 * used to be unconditional, which left a card 12px short of the button
 * above it on a 480dp phone (a 432px column) — the ragged right edge
 * that every full-width control on the screen disagreed with.
 *
 * `lg` is 1024 and the column reaches 864 at 960, so between those two
 * widths a tile fills its row instead of pairing with a second one. That
 * band is narrower than the ragged edge this replaced, and it is the one
 * thing here chosen by what the stack resolves rather than by the numbers.
 *
 * The two-line title slot is fixed height, so a ragged bottom edge is
 * invisible and the last line can hug the title.
 *
 * Nothing reserves empty height. That is why the two cards built on this
 * — a trip and an event — can drop a line without the grid going wonky.
 *
 * A 404 is a state, not a blank box: a photo that fails to load
 * falls back to the illustrated tile, same as a missing one.
 *
 * Hover (web, wide only): the photo and the text both zoom — the photo
 * inside its clipped frame, the text from its left edge so it grows into
 * the grid gap rather than over the neighbouring card.
 */
export function PhotoCard({
  image,
  placeholder,
  photoSourceUri,
  overlay,
  meta,
  title,
  footnote,
  onPress,
}: {
  image: string | null;
  /** The illustrated tile rendered when there is no photo, or it failed to load. */
  placeholder: ReactNode;
  /**
   * The photo's required Google Maps source link. When present a small
   * corner affordance opens it. The affordance is deliberately NOT the
   * photo: a tile's whole surface — photo included — belongs to the
   * card's own `onPress`, and wrapping the 2:1 image in a second
   * pressable meant a tap anywhere on the picture opened Maps instead
   * of the trip or event the tile stands for. The detail surfaces tap
   * the whole image, because there the photo is the page and has no
   * competing action. Null for uploads and placeholders, which carry no
   * source to reach.
   */
  photoSourceUri?: string | null;
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
  const [failed, setFailed] = useState(false);
  const slot = imageSlot({ image, failed });

  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      className="w-full lg:max-w-[420px] cursor-pointer"
    >
      <View className="relative overflow-hidden">
        {slot.kind === "placeholder" ? (
          <View className="w-full aspect-[2/1]">{placeholder}</View>
        ) : (
          <Image
            source={{ uri: slot.url }}
            resizeMode="cover"
            onError={() => setFailed(true)}
            className={`w-full aspect-[2/1] ${zoom}`}
          />
        )}
        {overlay ? (
          <View className="absolute left-3 top-3">{overlay}</View>
        ) : null}
        {/* The source link, at the policy's minimum target: 44dp, top
            right so it cannot collide with the top-left overlay chip. */}
        {photoSourceUri && slot.kind === "photo" ? (
          <Pressable
            onPress={() => void Linking.openURL(photoSourceUri)}
            aria-label="View photo source on Google Maps"
            className="absolute right-0 top-0 h-11 w-11 items-center justify-center"
          >
            <ArrowUpRight color={INK} size={18} />
          </Pressable>
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
