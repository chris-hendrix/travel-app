import { Platform, useWindowDimensions } from "react-native";

/**
 * Hover affordances belong to pointer devices with room to spare: real
 * hover, on web, at the wide breakpoint. Touch devices get press
 * feedback instead, and a narrow window keeps the quiet layout.
 */
export function useWideHover() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 768;
}
