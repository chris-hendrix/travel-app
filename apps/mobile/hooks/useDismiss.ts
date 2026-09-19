import { useCallback } from "react";
import { useRouter } from "expo-router";

/**
 * Close a fullscreen dialog. A dialog opened directly — a deep link, a
 * notification, a reload — has nothing to pop back to, so fall back to
 * the screen the dialog belongs to instead of leaving the user stuck.
 */
export function useDismiss(fallbackHref: string) {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  }, [router, fallbackHref]);
}
