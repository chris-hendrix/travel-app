/**
 * Trailing-edge debounce for keystroke-driven queries.
 *
 * `createTrailingDebounce` and `useDebouncedValue` moved verbatim out
 * of `lib/queries/places.ts` (the pair that module's own comment
 * calls one unit): the admin user search is the second caller, and
 * the admin domain importing a generic hook from the places domain
 * would be the cross-domain dependency this move removes.
 * `lib/queries/places.ts` re-exports everything moved, so its call
 * sites and specs keep working untouched.
 *
 * Node-importable by design: `react` only, never `react-native`.
 */

import { useEffect, useMemo, useState } from "react";

/**
 * Trailing-edge delay for keystroke-driven queries. Moved with the
 * pair above: it was already only the default below, so this keeps
 * one definition instead of two that could drift.
 */
export const SUGGESTION_DEBOUNCE_MS = 250;

/**
 * Trailing-edge debounce as a framework-free unit: rapid `push`es
 * collapse into one `onSettled(lastValue)` after `delayMs` of quiet.
 * `useDebouncedValue` (below) is built on this, so the debounce the
 * specs assert is the debounce the hooks ship — not a copy of it.
 */
export function createTrailingDebounce<T>(
  delayMs: number,
  onSettled: (value: T) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(value: T) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        onSettled(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/** The debounced twin of a fast-moving input value. */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = SUGGESTION_DEBOUNCE_MS,
): T {
  const [current, setCurrent] = useState(value);
  const settle = useMemo(
    () => createTrailingDebounce<T>(delayMs, setCurrent),
    [delayMs],
  );
  useEffect(() => {
    if (Object.is(value, current)) return;
    settle.push(value);
    return () => settle.cancel();
  }, [value, current, settle]);
  return current;
}
