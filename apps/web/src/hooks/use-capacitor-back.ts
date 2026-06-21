"use client";

import { useEffect } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { isNative } from "@/lib/platform";

/**
 * Sets up the Capacitor Android back button listener globally.
 * When back is pressed:
 * - If history exists, calls window.history.back() (which triggers popstate → useDialogBack handles it)
 * - If no history, exits the app
 *
 * Only active on native (Capacitor) platforms.
 */
export function useCapacitorBack() {
  useEffect(() => {
    if (!isNative()) return;

    let handle: PluginListenerHandle | undefined;
    let cancelled = false;

    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    }).then((h) => {
      if (!cancelled) {
        handle = h;
      } else {
        h.remove();
      }
    });

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);
}
