// Tests for theme configuration (ids and types)

import { describe, it, expect } from "vitest";
import { THEME_IDS } from "../config/themes";
import type { ThemePreset, ThemeBackground } from "../types/theme";

describe("THEME_IDS", () => {
  it("should be a non-empty tuple", () => {
    expect(THEME_IDS.length).toBeGreaterThan(0);
  });

  it("should equal the expected five ids", () => {
    expect(THEME_IDS).toEqual([
      "impressionist-beach",
      "pop-art-neon-city",
      "romanticism-mountain",
      "art-nouveau-wedding-cake",
      "80s-pop-art-ski-slope",
    ]);
  });
});

describe("ThemePreset type", () => {
  it("should allow creating a valid preset object", () => {
    const preset: ThemePreset = {
      id: "test-theme",
      name: "Test Theme",
      tags: ["dark", "bold"],
      palette: ["#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#ffff00"],
      background: { type: "solid", color: "#000000", isDark: true },
    };
    expect(preset.id).toBe("test-theme");
    expect(preset.palette).toHaveLength(5);
  });

  it("should allow gradient backgrounds", () => {
    const bg: ThemeBackground = {
      type: "gradient",
      angle: 90,
      stops: ["#000000", "#ffffff"],
      isDark: false,
    };
    expect(bg.type).toBe("gradient");
    expect(bg.stops).toHaveLength(2);
  });

  it("should allow image backgrounds", () => {
    const bg: ThemeBackground = {
      type: "image",
      url: "https://example.com/bg.jpg",
      isDark: true,
    };
    expect(bg.type).toBe("image");
    expect(bg.url).toContain("https://");
  });
});
