"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { THEME_PRESETS, THEME_FONTS } from "@tripful/shared/config";
import { resolveThemeStyles, resolvePaletteStyles } from "@/lib/theme-styles";

interface TripThemeProviderProps {
  themeId: string | null | undefined;
  themeFont: string | null | undefined;
  children: ReactNode;
  /**
   * "page" — sets full semantic + palette CSS vars on document root
   *          (themes header, dialogs, everything). Cleans up on unmount.
   * "local" — only palette colors on a scoped wrapper div (for trip cards).
   */
  scope?: "page" | "local";
}

/**
 * Applies trip theme CSS custom properties.
 *
 * - scope="page": sets vars on `document.documentElement` so they cascade
 *   to the entire page — header, portaled dialogs, everything.
 * - scope="local": wraps children in a `className="contents"` div with
 *   only palette color overrides (no semantic tokens).
 */
export function TripThemeProvider({
  themeId,
  themeFont,
  children,
  scope = "local",
}: TripThemeProviderProps) {
  const preset = THEME_PRESETS.find((p) => p.id === themeId) ?? null;

  // Page-scoped: set all vars on document root (layout effect to avoid flash)
  useLayoutEffect(() => {
    if (scope !== "page" || !preset) return;

    const styles = resolveThemeStyles(preset);

    if (themeFont && themeFont in THEME_FONTS) {
      styles["--font-theme"] =
        THEME_FONTS[themeFont as keyof typeof THEME_FONTS];
    }

    const root = document.documentElement;
    const keys = Object.keys(styles);

    for (const key of keys) {
      root.style.setProperty(key, styles[key] ?? "");
    }
    root.dataset.tripTheme = preset.background.isDark ? "dark" : "light";

    return () => {
      for (const key of keys) {
        root.style.removeProperty(key);
      }
      delete root.dataset.tripTheme;
    };
  }, [scope, preset, themeFont]);

  // Page-scoped rendering: no wrapper needed (vars are on root)
  if (scope === "page") {
    return <>{children}</>;
  }

  // Local-scoped: palette-only vars on a wrapper div
  if (!preset) {
    return <>{children}</>;
  }

  const localStyles: Record<string, string> = resolvePaletteStyles(preset);

  if (themeFont && themeFont in THEME_FONTS) {
    localStyles.fontFamily = THEME_FONTS[themeFont as keyof typeof THEME_FONTS];
  }

  return (
    <div style={localStyles} className="contents">
      {children}
    </div>
  );
}
