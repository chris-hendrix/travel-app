// Font configuration for trip themes

import type { ThemeFont } from "../types/theme";

/**
 * Maps font IDs to CSS font-family values.
 * Each value uses a CSS custom property set by Next.js font loading,
 * with appropriate fallback font stacks.
 */
export const THEME_FONTS: Record<ThemeFont, string> = {
  righteous: "var(--font-righteous), system-ui, sans-serif",
  bitter: "var(--font-bitter), Georgia, serif",
  "plus-jakarta": "var(--font-plus-jakarta), system-ui, sans-serif",
  playfair: "var(--font-playfair), Georgia, serif",
  "space-grotesk": "var(--font-space-grotesk), monospace",
  nunito: "var(--font-nunito), system-ui, sans-serif",
  caveat: "var(--font-caveat), cursive",
  oswald: "var(--font-oswald), Impact, sans-serif",
};

/**
 * Human-readable display names for each font option.
 * Used in font picker UI.
 */
export const FONT_DISPLAY_NAMES: Record<ThemeFont, string> = {
  righteous: "Righteous",
  bitter: "Bitter",
  "plus-jakarta": "Plus Jakarta Sans",
  playfair: "Playfair Display",
  "space-grotesk": "Space Grotesk",
  nunito: "Nunito",
  caveat: "Caveat",
  oswald: "Oswald",
};
