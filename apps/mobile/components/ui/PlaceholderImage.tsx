import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import { KINDS, type PlaceholderKind } from "@/lib/placeholder";

/**
 * Fill the frame from its edges, in a `style` rather than a class.
 *
 * The class form cannot work for a *static asset* on the web export:
 * react-native-web resolves `require()`d images to their intrinsic size
 * and writes `width`/`height` as an inline style on the Image wrapper.
 * Inline beats any class, so `absolute inset-0` still rendered an
 * 800x533 photo inside a 144x72 frame. A `style` prop is merged into
 * that same inline block and wins, and `100%` is resolved against the
 * frame's edges rather than the image's own size.
 */
const FILL = StyleSheet.create({
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
});

/**
 * The fallback an image slot renders when there is no photo, or the
 * photo failed to load: the kind's bundled stock photo, cropped to
 * fill whatever box holds it — the same `cover` behaviour a place
 * photo gets, so the fallback is indistinguishable in shape from the
 * real thing.
 *
 * `style={FILL}` rather than `className="h-full w-full"`, and that is not a
 * style preference. On the web export both classes are ignored for a static
 * asset: react-native-web knows a `require()`d image's intrinsic size and
 * pins it as an inline `width`/`height`. A 144x72 frame therefore rendered
 * the 800x533 fallback at 800x533, spilling 656x461px over whatever sat
 * beside it. The two call sites that happened to have an `overflow-hidden`
 * ancestor clipped it, which is why it went unnoticed. Every caller already
 * puts this inside a frame with a definite size; do not put it in an
 * auto-height box.
 */
export function PlaceholderImage({ kind }: { kind: PlaceholderKind }) {
  return (
    <Image
      source={KINDS[kind]}
      contentFit="cover"
      style={FILL.image}
      accessibilityIgnoresInvertColors
    />
  );
}
