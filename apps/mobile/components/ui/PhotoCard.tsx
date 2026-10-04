import { type ReactNode, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { Image } from "@/components/ui/Image";
import { useMotion } from "@/hooks/useMotion";
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
 * falls back to the kind's stock photo, same as a missing one.
 *
 * The photo is `expo-image` rather than React Native's `Image`, and the
 * difference is the cache: a place photo is a remote file shown on a card
 * the reader scrolls past and comes back to, and `expo-image` keeps it in
 * memory and on disk, so the second look is not a second download. It is
 * the same component on the web export, where it is an `<img>` with a
 * `cachePolicy` instead of the browser's own heuristics.
 *
 * No `transition`, deliberately. A photo arriving is a *load* in this
 * system and not a state change, and the motion vocabulary has no role for
 * an image fading in — the same reasoning that keeps a skeleton out of
 * `LoadingBlock`. `recyclingKey` is absent for a reason too: nothing in
 * this app is virtualized, so it would be a prop with no effect.
 *
 * The press is the card's whole affordance, on both surfaces. It used to
 * zoom under a pointer instead, on the web export and only from md up —
 * which meant the tile did nothing at all on the platform the app is for.
 * A pointer fires a press like a thumb does, so the same scale reaches a
 * mouse, and there is one behaviour to keep right rather than two.
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
  /** The kind's stock photo rendered when there is no photo, or it failed to load. */
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
  const [failed, setFailed] = useState(false);
  const motion = useMotion();
  const slot = imageSlot({ image, failed });

  return (
    <Pressable
      onPress={onPress}
      className={`w-full lg:max-w-[420px] cursor-pointer ${motion.press}`}
    >
      <View className="relative overflow-hidden">
        {slot.kind === "placeholder" ? (
          <View className="w-full aspect-[2/1]">{placeholder}</View>
        ) : (
          <Image
            source={{ uri: slot.url }}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
            className="w-full aspect-[2/1]"
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

      <View>
        <Text numberOfLines={1} className="mt-3 font-body-bold text-lg text-ink">
          {meta}
        </Text>
        <Text
          numberOfLines={2}
          className="mt-1 font-display-extrabold text-display-md uppercase text-ink"
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
