// Theme-related types for the Tripful platform

/**
 * Available font options for trip themes.
 * Each value maps to a Google Font loaded in the web app.
 */
export const THEME_FONT_VALUES = [
  "righteous", // 70s groovy display
  "bitter", // slab serif body
  "plus-jakarta", // already loaded — default clean sans
  "playfair", // already loaded — elegant serif
  "space-grotesk", // already loaded — techy accent
  "nunito", // to add — playful/rounded
  "caveat", // to add — handwritten
  "oswald", // to add — bold/condensed
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

/**
 * A postcard layout defines the physical card design:
 * attachment style, title placement, font, and decorative elements.
 */
export interface PostcardLayout {
  id: string;
  name: string;
  font: string;
  titlePlacement: "bottom-left" | "bottom-center" | "center" | "top-left";
  attachment: {
    type: "pushpin" | "tape" | "magnet" | "clip";
    position: { top: string; right?: string; left?: string };
    rotation?: number;
  };
  defaultRotation: number;
  decorations?: Array<{
    type: "postmark" | "stamp" | "airmail-stripe";
    position: string;
    opacity: number;
  }>;
}

export const POSTCARD_LAYOUT_VALUES = ["classic-pushpin"] as const;
export type PostcardLayoutId = (typeof POSTCARD_LAYOUT_VALUES)[number];
