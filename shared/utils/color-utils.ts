/**
 * Color utility functions for theme palette derivation.
 * Pure functions with no external dependencies.
 */

/**
 * Expand a 3-character hex string to 6 characters.
 * e.g., "f0a" → "ff00aa"
 */
function expandShortHex(hex: string): string {
  if (hex.length === 3) {
    return (
      hex.charAt(0) +
      hex.charAt(0) +
      hex.charAt(1) +
      hex.charAt(1) +
      hex.charAt(2) +
      hex.charAt(2)
    );
  }
  return hex;
}

/**
 * Parse a hex color string into RGB components (0-255).
 * Accepts "#abc", "abc", "#aabbcc", or "aabbcc".
 */
function parseHex(hex: string): [number, number, number] {
  const normalized = expandShortHex(hex.replace("#", ""));
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Convert hex color to HSL values.
 * @param hex - Hex color string (e.g., "#2563eb", "2563eb", "#f00")
 * @returns [h, s, l] where h is 0-360, s and l are 0-100
 */
export function hexToHsl(hex: string): [number, number, number] {
  const [ri, gi, bi] = parseHex(hex);
  const r = ri / 255;
  const g = gi / 255;
  const b = bi / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, Math.round(l * 100)];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Convert HSL values to hex color string.
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color string with # prefix
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Derive light background and border variants from a base color.
 * Used to generate the *-light and *-border CSS variable values.
 * @param hex - Base hex color
 * @returns { base, light, border } hex strings
 */
export function derivePaletteVariants(hex: string): {
  base: string;
  light: string;
  border: string;
} {
  const [h] = hexToHsl(hex);

  // light: same hue, moderate saturation (~35%), high lightness (~92%)
  // Produces a noticeably tinted background (e.g., #2563eb → soft blue like #dce8f3)
  const light = hslToHex(h, 35, 92);

  // border: same hue, medium saturation (~45%), high lightness (~87%)
  // Produces a medium-pale tint (e.g., #2563eb → medium blue like #bfdbfe)
  const border = hslToHex(h, 45, 87);

  return {
    base: hex.startsWith("#") ? hex : `#${hex}`,
    light,
    border,
  };
}

/**
 * Derive dark background and border variants from a base color.
 * Used for event cards on dark theme backgrounds.
 * @param hex - Base hex color
 * @returns { base, light, border } hex strings
 */
export function deriveDarkPaletteVariants(hex: string): {
  base: string;
  light: string;
  border: string;
} {
  const [h] = hexToHsl(hex);

  // light: same hue, moderate saturation, very low lightness
  // Produces a noticeably tinted dark background
  const light = hslToHex(h, 35, 13);

  // border: same hue, moderate saturation, low-medium lightness
  // Produces a slightly visible colored border
  const border = hslToHex(h, 35, 24);

  return {
    base: hex.startsWith("#") ? hex : `#${hex}`,
    light,
    border,
  };
}

/**
 * Calculate the WCAG 2.0 relative luminance of a color from RGB components (0-255).
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (c: number) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Determine readable foreground color (black or white) for a given background.
 * Uses WCAG relative luminance formula.
 * @param hex - Background hex color
 * @returns "#000000" or "#ffffff"
 */
export function readableForeground(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const lum = relativeLuminance(r, g, b);
  // Threshold of 0.179 corresponds roughly to the midpoint where
  // white text has better contrast than black text
  return lum > 0.179 ? "#000000" : "#ffffff";
}
