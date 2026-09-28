import { Image } from "react-native";
import { KINDS, type PlaceholderKind } from "@/lib/placeholder";

/**
 * The fallback an image slot renders when there is no photo, or the
 * photo failed to load: the kind's bundled stock photo, cropped to
 * fill whatever box holds it — the same `cover` behaviour a place
 * photo gets, so the fallback is indistinguishable in shape from the
 * real thing.
 */
export function PlaceholderImage({ kind }: { kind: PlaceholderKind }) {
  return (
    <Image
      source={KINDS[kind]}
      resizeMode="cover"
      className="h-full w-full"
      accessibilityIgnoresInvertColors
    />
  );
}
