import { useState } from "react";
import { useRouter } from "expo-router";
import { startImpersonation, stopImpersonation } from "@/lib/queries/admin";
import { useAuth } from "@/lib/authStore";

/**
 * The way back to the admin identity, owned by `AppHeader`.
 *
 * This hook lives here rather than in `lib/queries/admin.ts` on
 * purpose: that module is node-importable (its test imports it under
 * plain vitest with no react-native and no expo-router), and the
 * `expo-router` import below breaks that surface (`useState`/`useAuth`
 * alone import cleanly; `useRouter` does not — the suite fails at
 * import with `SyntaxError: Unexpected token 'typeof'`). The plain
 * `stopImpersonation()` stays in the domain; this is the chrome's
 * state around it.
 *
 * Deliberately NOT a React Query hook: `stopImpersonation()` is a
 * plain async function and `unregisterPush()` / `adoptSession()` are
 * plain awaits, so this is `useState` for the pending word,
 * `useAuth()` for `adoptSession`, and `useRouter()` for the landing
 * route — nothing that reads, so it is safe in the chrome (which
 * renders outside the layout's `<Suspense>`). A failed stop leaves
 * the band in place with the word re-enabled; a 401 signs the session
 * out through the shared recovery in `lib/api.ts` and the band goes
 * with it. Nothing is toasted in either case.
 */
export function useStopImpersonation(): {
  stopping: boolean;
  stop: () => Promise<void>;
} {
  const [stopping, setStopping] = useState(false);
  const { adoptSession } = useAuth();
  const router = useRouter();

  const stop = async () => {
    setStopping(true);
    try {
      // Push first, best-effort — the same call `performSignOut`
      // makes first, for the same reason: the swap mints a new token.
      // Dynamic import so this module never statically pulls the push
      // stack (expo-notifications).
      try {
        const { unregisterPush } = await import("@/lib/push");
        await unregisterPush();
      } catch {
        // A phone that cannot unsubscribe still stops impersonating.
      }
      await stopImpersonation();
      await adoptSession();
      router.replace("/admin/users");
    } catch {
      // The band stays, the word re-enables: the failure is state,
      // not a message, and there is no toast to send it to.
    } finally {
      setStopping(false);
    }
  };

  return { stopping, stop };
}

/**
 * The way into another identity, owned by the admin record screen.
 *
 * The mirror of `useStopImpersonation` above, and here for the same
 * reason: the screen stays presentation and the async flow stays in
 * one place. `unregisterPush()` first (best-effort, the same call
 * `performSignOut` makes first — the swap mints a new token), then
 * `startImpersonation({userId, code})` (which already persists the
 * token), then `adoptSession()`, then the landing route. The landing
 * route DIFFERS from the stop hook's: start lands on `/trips` (the
 * signed-in home, now as that person), stop lands on `/admin/users`
 * (back to work, as yourself). Deliberately NOT a React Query hook,
 * for the same reason as the stop hook above.
 *
 * Errors propagate to the caller: a wrong or expired code must read
 * under the screen's code field, and only the screen knows that
 * sentence. Nothing is toasted in any case.
 */
export function useStartImpersonation(): {
  starting: boolean;
  start: (input: { userId: string; code: string }) => Promise<void>;
} {
  const [starting, setStarting] = useState(false);
  const { adoptSession } = useAuth();
  const router = useRouter();

  const start = async (input: { userId: string; code: string }) => {
    setStarting(true);
    try {
      // Push first, best-effort — see the stop hook above.
      // Dynamic import so this module never statically pulls the push
      // stack (expo-notifications).
      try {
        const { unregisterPush } = await import("@/lib/push");
        await unregisterPush();
      } catch {
        // A phone that cannot unsubscribe still starts impersonating.
      }
      await startImpersonation(input);
      await adoptSession();
      router.replace("/trips");
    } finally {
      setStarting(false);
    }
  };

  return { starting, start };
}
