import { useState, useEffect } from "react";

/**
 * Returns true when any dialog or sheet is open in the DOM.
 * Uses a MutationObserver to watch for elements with [role="dialog"].
 */
export function useHasOpenDialog() {
  const [hasDialog, setHasDialog] = useState(false);

  useEffect(() => {
    const check = () => {
      setHasDialog(document.querySelectorAll('[role="dialog"]').length > 0);
    };

    check();

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return hasDialog;
}
