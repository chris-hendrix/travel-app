// Curated theme presets for trip customization

import type { ThemePreset } from "../types/theme";

/**
 * Trip-type theme presets.
 * Each preset includes a background style, 5-color palette, default cover, and suggested font:
 *   [0] travel, [1] meal, [2] activity, [3] accommodation, [4] highlight
 *
 * All colors are hex values (never hsl — Tailwind v4 @theme bug).
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "impressionist-beach",
    name: "Impressionist Beach",
    tags: ["light", "beach"],
    palette: ["#2F7FA3", "#E88C6A", "#8EC6E8", "#1F3A4A", "#F2C14E"],
    background: {
      type: "gradient",
      angle: 160,
      stops: ["#F4E7C8", "#D4EEF6"],
      isDark: false,
    },
    defaultCoverUrl: "/themes/impressionist-beach-cover.webp",
    suggestedFont: "playfair",
  },
  {
    id: "pop-art-neon-city",
    name: "Pop Art Neon City",
    tags: ["dark", "city", "nightlife"],
    palette: ["#19D4FF", "#FF2F92", "#7A4DFF", "#E8E6FF", "#FF2F92"],
    background: {
      type: "solid",
      color: "#0F1030",
      isDark: true,
    },
    defaultCoverUrl: "/themes/pop-art-neon-city-cover.webp",
    suggestedFont: "space-grotesk",
  },
  {
    id: "romanticism-mountain",
    name: "Romanticism Mountain",
    tags: ["dark", "mountain", "nature"],
    palette: ["#5E7C9A", "#D6A25A", "#2F4A3A", "#E6DDCF", "#D6A25A"],
    background: {
      type: "solid",
      color: "#1A120B",
      isDark: true,
    },
    defaultCoverUrl: "/themes/romanticism-mountain-cover.webp",
    suggestedFont: "playfair",
  },
  {
    id: "art-nouveau-wedding-cake",
    name: "Art Nouveau Wedding Cake",
    tags: ["light", "wedding", "elegant"],
    palette: ["#7F9A86", "#D8A867", "#E7C6B6", "#4A3A2B", "#D8A867"],
    background: {
      type: "solid",
      color: "#F6F1E7",
      isDark: false,
    },
    defaultCoverUrl: "/themes/art-nouveau-wedding-cake-cover.webp",
    suggestedFont: "playfair",
  },
  {
    id: "80s-pop-art-ski-slope",
    name: "80s Pop Art Ski Slope",
    tags: ["light", "ski", "retro"],
    palette: ["#27C6D9", "#FF4FA3", "#FFD34F", "#2B2E4A", "#FF4FA3"],
    background: {
      type: "solid",
      color: "#F5F7F6",
      isDark: false,
    },
    defaultCoverUrl: "/themes/80s-pop-art-ski-slope-cover.webp",
    suggestedFont: "space-grotesk",
  },
];

/**
 * Tuple of all theme preset IDs, suitable for use with z.enum().
 * Cast as non-empty tuple to satisfy Zod's requirement.
 */
export const THEME_IDS = THEME_PRESETS.map((t) => t.id) as [
  string,
  ...string[],
];
