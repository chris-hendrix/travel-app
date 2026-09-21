import { useCallback } from "react";
import { useRouter } from "expo-router";

/**
 * Leave the sign-in flow.
 *
 * The exits before the app are labelled links under the form, the way
 * the code screen's are, and this is what most of them do: back if there
 * is somewhere to go back to, otherwise the landing. Declining to sign in
 * always ends somewhere rather than nowhere.
 *
 * The wordmark is deliberately not one of these. It means home once you
 * are in the app, but before that an unlabelled tap on the logo is a
 * worse exit than a word that says what it does.
 */
export function useLeaveFlow() {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
}
