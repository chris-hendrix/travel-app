import { describe, it, expect } from "vitest";
import {
  hexToHsl,
  hslToHex,
  derivePaletteVariants,
  readableForeground,
} from "./color-utils";

describe("hexToHsl", () => {
  it("should convert pure red", () => {
    expect(hexToHsl("#ff0000")).toEqual([0, 100, 50]);
  });

  it("should convert pure green", () => {
    expect(hexToHsl("#00ff00")).toEqual([120, 100, 50]);
  });

  it("should convert pure blue", () => {
    expect(hexToHsl("#0000ff")).toEqual([240, 100, 50]);
  });

  it("should convert white", () => {
    expect(hexToHsl("#ffffff")).toEqual([0, 0, 100]);
  });

  it("should convert black", () => {
    expect(hexToHsl("#000000")).toEqual([0, 0, 0]);
  });

  it("should handle hex without # prefix", () => {
    expect(hexToHsl("ff0000")).toEqual([0, 100, 50]);
    expect(hexToHsl("00ff00")).toEqual([120, 100, 50]);
  });

  it("should handle 3-character hex", () => {
    expect(hexToHsl("#f00")).toEqual([0, 100, 50]);
    expect(hexToHsl("#0f0")).toEqual([120, 100, 50]);
    expect(hexToHsl("#00f")).toEqual([240, 100, 50]);
    expect(hexToHsl("#fff")).toEqual([0, 0, 100]);
    expect(hexToHsl("#000")).toEqual([0, 0, 0]);
  });

  it("should handle 3-character hex without # prefix", () => {
    expect(hexToHsl("f00")).toEqual([0, 100, 50]);
  });

  it("should convert a mid-range color", () => {
    // #2563eb is a blue (roughly hue 217, sat 84, light 53)
    const [h, s, l] = hexToHsl("#2563eb");
    expect(h).toBeGreaterThanOrEqual(215);
    expect(h).toBeLessThanOrEqual(225);
    expect(s).toBeGreaterThanOrEqual(80);
    expect(s).toBeLessThanOrEqual(90);
    expect(l).toBeGreaterThanOrEqual(50);
    expect(l).toBeLessThanOrEqual(56);
  });

  it("should convert gray colors (zero saturation)", () => {
    const [, s] = hexToHsl("#808080");
    expect(s).toBe(0);
  });
});

describe("hslToHex", () => {
  it("should convert known HSL values to hex", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
  });

  it("should convert white and black", () => {
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(0, 0, 0)).toBe("#000000");
  });

  it("should handle zero saturation (grays)", () => {
    const gray = hslToHex(0, 0, 50);
    // Should be a mid-gray
    expect(gray).toBe("#808080");
  });

  it("should produce valid 7-character hex strings", () => {
    const result = hslToHex(210, 50, 60);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("should roundtrip with hexToHsl for primary colors", () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000"];
    for (const color of colors) {
      const [h, s, l] = hexToHsl(color);
      expect(hslToHex(h, s, l)).toBe(color);
    }
  });

  it("should roundtrip with hexToHsl for arbitrary colors", () => {
    // Due to rounding, roundtrip may differ by 1-2 in each RGB channel.
    // We test that the result is close rather than exact.
    const colors = ["#2563eb", "#d97706", "#059669", "#9333ea", "#6b7280"];
    for (const color of colors) {
      const [h, s, l] = hexToHsl(color);
      const roundtripped = hslToHex(h, s, l);

      // Parse both and compare channels within tolerance
      const parseHex = (hex: string) => {
        const n = hex.replace("#", "");
        return [
          parseInt(n.slice(0, 2), 16),
          parseInt(n.slice(2, 4), 16),
          parseInt(n.slice(4, 6), 16),
        ];
      };

      const [r1 = 0, g1 = 0, b1 = 0] = parseHex(color);
      const [r2 = 0, g2 = 0, b2 = 0] = parseHex(roundtripped);

      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(2);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(2);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(2);
    }
  });

  it("should handle edge hue values", () => {
    // Hue 0 and 360 should produce the same color
    expect(hslToHex(0, 100, 50)).toBe(hslToHex(360, 100, 50));
  });
});

describe("derivePaletteVariants", () => {
  it("should return an object with base, light, and border keys", () => {
    const result = derivePaletteVariants("#2563eb");
    expect(result).toHaveProperty("base");
    expect(result).toHaveProperty("light");
    expect(result).toHaveProperty("border");
  });

  it("should return valid hex color strings", () => {
    const result = derivePaletteVariants("#2563eb");
    const hexPattern = /^#[0-9a-f]{6}$/;
    expect(result.base).toMatch(hexPattern);
    expect(result.light).toMatch(hexPattern);
    expect(result.border).toMatch(hexPattern);
  });

  it("should preserve the base color", () => {
    const result = derivePaletteVariants("#2563eb");
    expect(result.base).toBe("#2563eb");
  });

  it("should preserve the base color when input lacks # prefix", () => {
    const result = derivePaletteVariants("2563eb");
    expect(result.base).toBe("#2563eb");
  });

  it("should produce a light variant (high lightness)", () => {
    const result = derivePaletteVariants("#2563eb");
    const [, , lightL] = hexToHsl(result.light);
    expect(lightL).toBeGreaterThanOrEqual(89);
    expect(lightL).toBeLessThanOrEqual(95);
  });

  it("should produce a border lighter than base but darker than light", () => {
    const result = derivePaletteVariants("#2563eb");
    const [, , baseL] = hexToHsl(result.base);
    const [, , borderL] = hexToHsl(result.border);
    const [, , lightL] = hexToHsl(result.light);

    expect(borderL).toBeGreaterThan(baseL);
    expect(borderL).toBeLessThan(lightL);
  });

  it("should preserve hue across all variants", () => {
    const result = derivePaletteVariants("#2563eb");
    const [baseH] = hexToHsl(result.base);
    const [lightH] = hexToHsl(result.light);
    const [borderH] = hexToHsl(result.border);

    // Hue should be within a few degrees (rounding in HSL conversion can shift by up to 5)
    expect(Math.abs(baseH - lightH)).toBeLessThanOrEqual(5);
    expect(Math.abs(baseH - borderH)).toBeLessThanOrEqual(5);
  });

  it("should produce noticeably tinted backgrounds for theme colors", () => {
    // Blue: #2563eb
    const blue = derivePaletteVariants("#2563eb");
    const [, , blueLL] = hexToHsl(blue.light);
    expect(blueLL).toBeGreaterThanOrEqual(89);
    expect(blueLL).toBeLessThanOrEqual(95);

    // Amber: #d97706
    const amber = derivePaletteVariants("#d97706");
    const [amberH] = hexToHsl(amber.light);
    const [amberBaseH] = hexToHsl("#d97706");
    expect(Math.abs(amberH - amberBaseH)).toBeLessThanOrEqual(3);

    // Green: #059669
    const green = derivePaletteVariants("#059669");
    const [, , greenLL] = hexToHsl(green.light);
    expect(greenLL).toBeGreaterThanOrEqual(89);
    expect(greenLL).toBeLessThanOrEqual(95);

    // Purple: #9333ea
    const purple = derivePaletteVariants("#9333ea");
    const [, , purpleBL] = hexToHsl(purple.border);
    expect(purpleBL).toBeGreaterThanOrEqual(84);
    expect(purpleBL).toBeLessThanOrEqual(90);
  });

  it("should work with achromatic colors", () => {
    // Gray has no hue, should still produce valid variants
    const result = derivePaletteVariants("#6b7280");
    expect(result.light).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.border).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("readableForeground", () => {
  it("should return black text for white background", () => {
    expect(readableForeground("#ffffff")).toBe("#000000");
  });

  it("should return white text for black background", () => {
    expect(readableForeground("#000000")).toBe("#ffffff");
  });

  it("should return white text for dark blue", () => {
    expect(readableForeground("#0f172a")).toBe("#ffffff");
  });

  it("should return black text for light yellow", () => {
    expect(readableForeground("#fffbeb")).toBe("#000000");
  });

  it("should return white text for dark colors", () => {
    expect(readableForeground("#1e293b")).toBe("#ffffff"); // slate-800
    expect(readableForeground("#1a1a1a")).toBe("#ffffff"); // near-black
    expect(readableForeground("#7c3aed")).toBe("#ffffff"); // violet-600
  });

  it("should return black text for light colors", () => {
    expect(readableForeground("#f8fafc")).toBe("#000000"); // slate-50
    expect(readableForeground("#eff6ff")).toBe("#000000"); // blue-50
    expect(readableForeground("#fbbf24")).toBe("#000000"); // amber-400
  });

  it("should handle 3-character hex", () => {
    expect(readableForeground("#fff")).toBe("#000000");
    expect(readableForeground("#000")).toBe("#ffffff");
  });

  it("should handle hex without # prefix", () => {
    expect(readableForeground("ffffff")).toBe("#000000");
    expect(readableForeground("000000")).toBe("#ffffff");
  });

  it("should handle mid-range grays", () => {
    // #808080 has luminance ~0.216 which is above the 0.179 threshold
    expect(readableForeground("#808080")).toBe("#000000");
    // #6b6b6b has luminance ~0.139 which is below the 0.179 threshold
    expect(readableForeground("#5a5a5a")).toBe("#ffffff");
  });
});
