// Postcard layout configurations for trip card rendering

import type { PostcardLayout } from "../types/theme";

/**
 * Available postcard layouts that define card design:
 * attachment style, title placement, font, and decorations.
 */
export const POSTCARD_LAYOUTS: PostcardLayout[] = [
  {
    id: "classic-pushpin",
    name: "Classic Pushpin",
    font: "var(--font-righteous), system-ui, sans-serif",
    titlePlacement: "bottom-left",
    attachment: {
      type: "pushpin",
      position: { top: "-8px", left: "50%" },
      rotation: 5,
    },
    defaultRotation: -1.5,
    decorations: [
      { type: "postmark", position: "top-right", opacity: 0.15 },
      { type: "airmail-stripe", position: "bottom", opacity: 0.6 },
    ],
  },
];

/**
 * Tuple of all postcard layout IDs, suitable for use with z.enum().
 * Cast as non-empty tuple to satisfy Zod's requirement.
 */
export const POSTCARD_LAYOUT_IDS = POSTCARD_LAYOUTS.map((l) => l.id) as [
  string,
  ...string[],
];
