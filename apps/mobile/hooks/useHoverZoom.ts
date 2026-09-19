import { useState } from "react";
import { useWideHover } from "@/hooks/useWideHover";

/**
 * The zoom a thing does under a pointer. One hook, so the card and the
 * list row cannot drift into two zooms that are nearly the same.
 *
 * Only on a wide pointer device: a thumb gets press feedback instead.
 */
export function useHoverZoom() {
  const canHover = useWideHover();
  const [hovering, setHovering] = useState(false);
  const hovered = canHover && hovering;

  return {
    hoverProps: {
      onHoverIn: () => setHovering(true),
      onHoverOut: () => setHovering(false),
    },
    zoom: `transition-transform duration-200 ease-out ${
      hovered ? "scale-105" : "scale-100"
    }`,
  };
}
