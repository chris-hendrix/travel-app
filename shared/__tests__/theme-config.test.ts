// Tests for theme configuration (presets, fonts, types)

import { describe, it, expect } from "vitest";
import { THEME_PRESETS, THEME_IDS } from "../config/themes";
import { THEME_FONTS, FONT_DISPLAY_NAMES } from "../config/theme-fonts";
import { THEME_FONT_VALUES, POSTCARD_LAYOUT_VALUES } from "../types/theme";
import type {
  ThemePreset,
  ThemeBackground,
  PostcardLayout,
  PostcardLayoutId,
} from "../types/theme";

describe("THEME_PRESETS", () => {
  it("should contain at least 3 presets", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("should have unique IDs", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have unique names", () => {
    const names = THEME_PRESETS.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should use kebab-case IDs", () => {
    const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
    THEME_PRESETS.forEach((preset) => {
      expect(preset.id).toMatch(kebabCaseRegex);
    });
  });

  it("should have exactly 5 palette colors per preset", () => {
    THEME_PRESETS.forEach((preset) => {
      expect(preset.palette).toHaveLength(5);
    });
  });

  it("should use only hex colors in palettes (no hsl)", () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    THEME_PRESETS.forEach((preset) => {
      preset.palette.forEach((color) => {
        expect(color).toMatch(hexRegex);
      });
    });
  });

  it("should have at least one tag per preset", () => {
    THEME_PRESETS.forEach((preset) => {
      expect(preset.tags.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("should have a valid background on each preset", () => {
    THEME_PRESETS.forEach((preset) => {
      const bg = preset.background;
      expect(["solid", "gradient", "image"]).toContain(bg.type);
      expect(typeof bg.isDark).toBe("boolean");

      if (bg.type === "solid") {
        expect(bg.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      } else if (bg.type === "gradient") {
        expect(bg.angle).toBeGreaterThanOrEqual(0);
        expect(bg.angle).toBeLessThanOrEqual(360);
        expect(bg.stops.length).toBeGreaterThanOrEqual(2);
        bg.stops.forEach((stop) => {
          expect(stop).toMatch(/^#[0-9a-fA-F]{6}$/);
        });
      } else if (bg.type === "image") {
        expect(typeof bg.url).toBe("string");
        expect(bg.url.length).toBeGreaterThan(0);
      }
    });
  });

  it("should have all dark backgrounds for vintage themes", () => {
    const darkCount = THEME_PRESETS.filter((p) => p.background.isDark).length;
    expect(darkCount).toBe(THEME_PRESETS.length);
  });

  it("should include warm and cool tag categories", () => {
    const allTags = new Set(THEME_PRESETS.flatMap((p) => p.tags));
    expect(allTags.has("warm")).toBe(true);
    expect(allTags.has("cool")).toBe(true);
  });

  it("should have no hsl values anywhere in backgrounds", () => {
    THEME_PRESETS.forEach((preset) => {
      const bg = preset.background;
      if (bg.type === "solid") {
        expect(bg.color).not.toContain("hsl");
      } else if (bg.type === "gradient") {
        bg.stops.forEach((stop) => {
          expect(stop).not.toContain("hsl");
        });
      }
    });
  });
});

describe("THEME_IDS", () => {
  it("should match the IDs from THEME_PRESETS", () => {
    const expectedIds = THEME_PRESETS.map((p) => p.id);
    expect(THEME_IDS).toEqual(expectedIds);
  });

  it("should be a non-empty array", () => {
    expect(THEME_IDS.length).toBeGreaterThan(0);
  });
});

describe("THEME_FONTS", () => {
  it("should have an entry for every font in THEME_FONT_VALUES", () => {
    THEME_FONT_VALUES.forEach((fontId) => {
      expect(THEME_FONTS[fontId]).toBeDefined();
      expect(typeof THEME_FONTS[fontId]).toBe("string");
    });
  });

  it("should contain CSS custom property references", () => {
    Object.values(THEME_FONTS).forEach((fontFamily) => {
      expect(fontFamily).toContain("var(--font-");
    });
  });

  it("should include fallback fonts", () => {
    // Each font-family string should have at least one comma (font + fallback)
    Object.values(THEME_FONTS).forEach((fontFamily) => {
      expect(fontFamily).toContain(",");
    });
  });
});

describe("FONT_DISPLAY_NAMES", () => {
  it("should have an entry for every font in THEME_FONT_VALUES", () => {
    THEME_FONT_VALUES.forEach((fontId) => {
      expect(FONT_DISPLAY_NAMES[fontId]).toBeDefined();
      expect(typeof FONT_DISPLAY_NAMES[fontId]).toBe("string");
    });
  });

  it("should have non-empty display names", () => {
    Object.values(FONT_DISPLAY_NAMES).forEach((name) => {
      expect(name.length).toBeGreaterThan(0);
    });
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

describe("THEME_FONT_VALUES", () => {
  it("should include righteous and bitter fonts", () => {
    expect(THEME_FONT_VALUES).toContain("righteous");
    expect(THEME_FONT_VALUES).toContain("bitter");
  });

  it("should have righteous and bitter before other fonts", () => {
    const righteousIndex = THEME_FONT_VALUES.indexOf("righteous");
    const bitterIndex = THEME_FONT_VALUES.indexOf("bitter");
    const plusJakartaIndex = THEME_FONT_VALUES.indexOf("plus-jakarta");
    expect(righteousIndex).toBeLessThan(plusJakartaIndex);
    expect(bitterIndex).toBeLessThan(plusJakartaIndex);
  });
});

describe("POSTCARD_LAYOUT_VALUES", () => {
  it("should contain at least one layout", () => {
    expect(POSTCARD_LAYOUT_VALUES.length).toBeGreaterThanOrEqual(1);
  });

  it("should include classic-pushpin layout", () => {
    expect(POSTCARD_LAYOUT_VALUES).toContain("classic-pushpin");
  });

  it("should use kebab-case IDs", () => {
    const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
    POSTCARD_LAYOUT_VALUES.forEach((id) => {
      expect(id).toMatch(kebabCaseRegex);
    });
  });
});

describe("PostcardLayout type", () => {
  it("should allow creating a valid postcard layout object", () => {
    const layout: PostcardLayout = {
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
    };
    expect(layout.id).toBe("classic-pushpin");
    expect(layout.attachment.type).toBe("pushpin");
    expect(layout.decorations).toHaveLength(2);
  });

  it("should allow layout without decorations", () => {
    const layout: PostcardLayout = {
      id: "minimal",
      name: "Minimal",
      font: "var(--font-bitter), Georgia, serif",
      titlePlacement: "center",
      attachment: {
        type: "tape",
        position: { top: "0px", right: "10px" },
      },
      defaultRotation: 0,
    };
    expect(layout.decorations).toBeUndefined();
  });

  it("should derive PostcardLayoutId from POSTCARD_LAYOUT_VALUES", () => {
    const layoutId: PostcardLayoutId = "classic-pushpin";
    expect(POSTCARD_LAYOUT_VALUES).toContain(layoutId);
  });
});
