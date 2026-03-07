// Theme-related types for the Tripful platform

/**
 * Available font options for trip themes.
 * Each value maps to a Google Font loaded in the web app.
 */
export const THEME_FONT_VALUES = [
  "plus-jakarta", // already loaded — default clean sans
  "playfair", // already loaded — elegant serif
  "space-grotesk", // already loaded — techy accent
] as const;

/** Font identifier type derived from available font options */
export type ThemeFont = (typeof THEME_FONT_VALUES)[number];

/**
 * Discriminated union for theme backgrounds.
 * `isDark` determines whether overlaid text should be white (true) or dark (false).
 */
export type ThemeBackground =
  | { type: "solid"; color: string; isDark: boolean }
  | { type: "gradient"; angle: number; stops: string[]; isDark: boolean }
  | { type: "image"; url: string; isDark: boolean };

/**
 * A curated theme preset with background and 5-color palette.
 * Presets are defined in shared config and referenced by ID in the database.
 */
export interface ThemePreset {
  /** Unique preset identifier (kebab-case) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Categorization tags for filtering/grouping */
  tags: string[];
  /** 5 hex color strings: [travel, meal, activity, accommodation, highlight] */
  palette: string[];
  /** Background style with dark/light indicator */
  background: ThemeBackground;
}
