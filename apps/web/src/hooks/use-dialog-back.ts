"use client";

import { useEffect, useRef } from "react";

/**
 * Pushes a history entry when a dialog/sheet opens so that the back gesture
 * (Android back button or browser back) closes the dialog instead of navigating away.
 *
 * Usage: useDialogBack(open, () => onOpenChange(false));
 */
export function useDialogBack(open: boolean, onClose: () => void) {
  const pushedRef = useRef(false);

  // Push a history entry when dialog opens (only once per open cycle)
  useEffect(() => {
    if (open && !pushedRef.current) {
      window.history.pushState({ __dialog: true }, "");
      pushedRef.current = true;
    }
    if (!open) {
      pushedRef.current = false;
    }
  }, [open]);

  // Listen for back button — close dialog instead of navigating away
  useEffect(() => {
    if (!open) return;

    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.__dialog) {
        onClose();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [open, onClose]);
}
