"use client";

import { useEffect, useRef, useCallback } from "react";
import { THEME_PRESETS, THEME_FONTS } from "@journiful/shared/config";
import type { ThemeFont } from "@journiful/shared/types";
import { resolveThemeStyles, ALL_THEME_CSS_KEYS } from "@/lib/theme-styles";

interface UseThemePreviewOptions {
  /** Currently selected theme ID (null = "None") */
  themeId: string | null;
  /** Currently selected font (null = default) */
  themeFont: string | null;
  /** Theme ID the page already shows (what to restore on cancel) */
  initialThemeId: string | null;
  /** Font the page already shows */
  initialThemeFont: string | null;
  /** Tied to dialog open state — false pauses all side-effects */
  enabled?: boolean;
}

/**
 * Snapshot of inline style values for every theme CSS key.
 * `undefined` means the property was not set inline.
 */
type CssSnapshot = Map<string, string | undefined>;

function snapshotInlineStyles(): CssSnapshot {
  const root = document.documentElement;
  const snap: CssSnapshot = new Map();
  for (const key of ALL_THEME_CSS_KEYS) {
    const val = root.style.getPropertyValue(key);
    snap.set(key, val || undefined);
  }
  snap.set("__tripTheme", root.dataset.tripTheme);
  return snap;
}

function restoreSnapshot(snap: CssSnapshot) {
  const root = document.documentElement;
  for (const [key, val] of snap) {
    if (key === "__tripTheme") {
      if (val !== undefined) {
        root.dataset.tripTheme = val;
      } else {
        delete root.dataset.tripTheme;
      }
      continue;
    }
    if (val !== undefined) {
      root.style.setProperty(key, val);
    } else {
      root.style.removeProperty(key);
    }
  }
}

function applyThemeToRoot(themeId: string | null, themeFont: string | null) {
  const root = document.documentElement;
  const preset = themeId
    ? (THEME_PRESETS.find((p) => p.id === themeId) ?? null)
    : null;
  const styles = resolveThemeStyles(preset);

  if (themeFont && themeFont in THEME_FONTS) {
    styles["--font-theme"] = THEME_FONTS[themeFont as ThemeFont];
  }

  // Remove all theme keys first (handles dark→light where dark has extra keys)
  for (const key of ALL_THEME_CSS_KEYS) {
    root.style.removeProperty(key);
  }

  // Apply new values
  for (const [key, val] of Object.entries(styles)) {
    root.style.setProperty(key, val);
  }

  // Set data attribute for theme-aware CSS selectors (textures/shadows)
  if (preset) {
    root.dataset.tripTheme = preset.background.isDark ? "dark" : "light";
  } else {
    delete root.dataset.tripTheme;
  }
}

/**
 * Live-previews a trip theme on the page while a dialog is open.
 *
 * - Snapshots inline CSS vars when enabled
 * - Applies theme changes as user picks options
 * - Restores snapshot on unmount/disable (cancel)
 * - `commit()` prevents restore (submit case)
 */
export function useThemePreview({
  themeId,
  themeFont,
  initialThemeId,
  initialThemeFont,
  enabled = true,
}: UseThemePreviewOptions): { commit: () => void } {
  const snapshotRef = useRef<CssSnapshot | null>(null);
  const committedRef = useRef(false);
  const hasSeenInitialRef = useRef(false);
  const prevInitialRef = useRef({
    themeId: initialThemeId,
    font: initialThemeFont,
  });

  // Take snapshot when enabled transitions to true
  useEffect(() => {
    if (!enabled) {
      // Reset state for next open
      hasSeenInitialRef.current = false;
      committedRef.current = false;
      return;
    }

    // Snapshot current inline styles
    snapshotRef.current = snapshotInlineStyles();
    committedRef.current = false;
    hasSeenInitialRef.current = false;

    return () => {
      // Restore on unmount/disable unless committed
      if (!committedRef.current && snapshotRef.current) {
        restoreSnapshot(snapshotRef.current);
      }
      snapshotRef.current = null;
    };
    // Only run on enabled transitions, not on themeId/themeFont changes
  }, [enabled]);

  // Re-snapshot when server data updates (mutation succeeded) so that
  // the "return to initial" branch doesn't restore a stale snapshot.
  useEffect(() => {
    if (!enabled || !snapshotRef.current) return;
    if (
      prevInitialRef.current.themeId !== initialThemeId ||
      prevInitialRef.current.font !== initialThemeFont
    ) {
      prevInitialRef.current = {
        themeId: initialThemeId,
        font: initialThemeFont,
      };
      // TripThemeProvider (layout effect) already applied correct styles
      snapshotRef.current = snapshotInlineStyles();
    }
  }, [enabled, initialThemeId, initialThemeFont]);

  // Apply theme preview when selection changes
  useEffect(() => {
    if (!enabled || !snapshotRef.current) return;

    // Wait for the form to settle to the initial value before previewing.
    // This prevents a flash in the edit dialog where the form briefly has
    // themeId=null before form.reset() sets the trip's actual themeId.
    if (!hasSeenInitialRef.current) {
      if (themeId === initialThemeId && themeFont === initialThemeFont) {
        hasSeenInitialRef.current = true;
      }
      return;
    }

    // If returning to initial selection, restore the snapshot exactly
    if (themeId === initialThemeId && themeFont === initialThemeFont) {
      restoreSnapshot(snapshotRef.current);
      return;
    }

    // "None" selection — remove all inline overrides so @theme defaults show
    if (themeId === null) {
      const root = document.documentElement;
      for (const key of ALL_THEME_CSS_KEYS) {
        root.style.removeProperty(key);
      }
      delete root.dataset.tripTheme;
      // Point --theme-background at the default so elements using
      // var(--theme-background) fall back to the unthemed background color
      root.style.setProperty("--theme-background", "var(--color-background)");
      // Re-apply font if selected
      if (themeFont && themeFont in THEME_FONTS) {
        root.style.setProperty(
          "--font-theme",
          THEME_FONTS[themeFont as ThemeFont],
        );
      }
      return;
    }

    applyThemeToRoot(themeId, themeFont);
  }, [enabled, themeId, themeFont, initialThemeId, initialThemeFont]);

  const commit = useCallback(() => {
    committedRef.current = true;
  }, []);

  return { commit };
}
