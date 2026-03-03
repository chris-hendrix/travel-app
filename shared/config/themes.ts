// Curated theme presets for trip customization

import type { ThemePreset } from "../types/theme";

/**
 * 3 vintage themes with 1970s Kodachrome-inspired palettes.
 * Each preset includes a background style and 5-color palette:
 *   [0] travel, [1] meal, [2] activity, [3] accommodation, [4] highlight
 *
 * All colors are hex values (never hsl — Tailwind v4 @theme bug).
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "faded-film-beach",
    name: "Beach",
    tags: ["warm"],
    palette: ["#d07050", "#50a8a0", "#c9a84c", "#e08850", "#5a8a50"],
    background: {
      type: "gradient",
      angle: 135,
      stops: ["#d4a060", "#5a9aaa"],
      isDark: true,
    },
  },
  {
    id: "faded-film-ski",
    name: "Ski Lodge",
    tags: ["cool"],
    palette: ["#c45a3c", "#5a9a7a", "#c9a84c", "#7a9ab0", "#8a6050"],
    background: {
      type: "gradient",
      angle: 160,
      stops: ["#e8e4e0", "#6a8a6a", "#2d5a3d"],
      isDark: true,
    },
  },
  {
    id: "retro-city",
    name: "City",
    tags: ["cool"],
    palette: ["#e08850", "#50b0a0", "#c9a84c", "#b070a0", "#7090c0"],
    background: {
      type: "gradient",
      angle: 135,
      stops: ["#1a3a4a", "#4a8a8a"],
      isDark: true,
    },
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
