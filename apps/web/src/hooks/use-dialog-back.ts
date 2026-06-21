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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // Always fresh, avoids effect re-runs

  // Push history entry on open, clean up on programmatic close
  useEffect(() => {
    if (open && !pushedRef.current) {
      window.history.pushState({ __dialog: true }, "");
      pushedRef.current = true;
    }
    if (!open && pushedRef.current) {
      // Dialog was closed programmatically (close button, not back gesture)
      // Clean up the history entry we pushed
      pushedRef.current = false;
      window.history.back();
    }
  }, [open]);

  // Listen for back gesture — close dialog instead of navigating away
  useEffect(() => {
    if (!open) return;

    const handlePopState = () => {
      if (pushedRef.current) {
        // Back gesture: history already went back by one step
        // Mark as handled so the cleanup effect doesn't fire history.back() again
        pushedRef.current = false;
        onCloseRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [open]); // Only depends on open — onCloseRef avoids stale closure
}
