/**
 * Whether there is a session, for the parts of the app that cannot ask.
 *
 * `lib/session` reads the token through `expo-secure-store` on native and
 * `lib/authStore` is a React context; both import `react-native`, which
 * makes them unimportable from the node tests that render the stores
 * (`lib/queries/__tests__/notifications.test.ts` and `unread.test.ts` —
 * importing `react-native` there pulls in Flow sources that the test
 * transformer cannot parse). This module is deliberately three variables
 * and no imports, so a store can gate a query on the session without
 * dragging a native module into its static graph.
 *
 * It is a *cache* of the auth store's state, never a second source of
 * truth: `AuthProvider` writes it on every transition, and readers only
 * ever ask "should I fetch yet".
 */
let signedIn = false;
const listeners = new Set<() => void>();

/** The current answer. Cheap, synchronous, safe to call during render. */
export function isSignedIn(): boolean {
  return signedIn;
}

/** Called by `AuthProvider` on restore, sign-in and sign-out. */
export function setSignedIn(next: boolean): void {
  // A redundant set must not notify: React re-renders on every notify,
  // and the auth store sets this on paths that can repeat (a restore that
  // lands on the same state, a 401 recovery for a session already gone).
  if (signedIn === next) return;
  signedIn = next;
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` shape: subscribe returns its own unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
