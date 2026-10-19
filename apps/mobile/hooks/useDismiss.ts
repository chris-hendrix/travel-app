import { useCallback } from "react";
import { useRouter } from "expo-router";

/**
 * Close a fullscreen dialog. A dialog opened directly — a deep link, a
 * notification, a reload — has nothing to pop back to, so fall back to
 * the screen the dialog belongs to instead of leaving the user stuck.
 *
 * One pop, which is right for a write whose result is the screen
 * underneath: you edited a record, so you land back on it, and you added
 * one from the list, so you land back on the list. It is the wrong
 * landing for a write whose result is *further* down than one screen —
 * that is `useDismissTo`.
 */
export function useDismiss(fallbackHref: string) {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  }, [router, fallbackHref]);
}

/**
 * Close a dialog onto a screen that may be underneath it rather than
 * directly behind it.
 *
 * Travel's duplicate is the case: its form is pushed from the source
 * record's sheet, which was pushed from the board, and the row it files
 * is on the board. One pop would leave the reader on the sheet they
 * duplicated *from* — somebody else's record, showing nothing of what
 * they just filed — which is what this hook exists to stop. `dismissTo`
 * walks back until the named screen is reached, however deep it is, and
 * the call site is where that case is written out
 * (`app/trips/travel/form.tsx`); what belongs here is the rule.
 *
 * A dialog opened directly has the screen nowhere in its stack at all,
 * and the router replaces with it rather than leaving the reader where
 * they are, so a cold-loaded form still lands on the thing the write
 * belongs to. That is why this takes the destination rather than a count
 * of screens: the count is the thing that goes wrong when a door is
 * added above it.
 *
 * The match is on the route **name**, and the href's params are what the
 * landed screen is then given — so the params here are load-bearing for
 * how it lands, not decoration on the match (`POP_TO` in expo-router's
 * vendored stack router: it walks the stack for the name, and replaces the
 * top route with the href when the name is not in the stack at all).
 *
 * A **delete** lands here too, and for the same reason a duplicate does:
 * the surface the row left is not the surface the record's card came from.
 * `replace` is not the answer either, because the card was opened from that
 * very surface — replacing the card with the roll call leaves two copies of
 * it in the stack, and back from the roll call lands on the roll call.
 * Where such a write *unmounts* the thing that started it (the roster
 * paints a removed row out before the server answers, so the card goes with
 * it), the call has to be made by the screen above the card rather than by
 * a `mutate` callback on the card; `app/trips/members/detail.tsx` is that
 * case written out.
 */
export function useDismissTo(href: string) {
  const router = useRouter();

  return useCallback(() => {
    router.dismissTo(href);
  }, [router, href]);
}
