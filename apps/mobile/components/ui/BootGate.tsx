import { BootCover } from "@/components/ui/BootCover";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/authStore";

/**
 * The root fallback's gate: the cover for the boot, a line for everything else.
 *
 * `app/_layout.tsx`'s `<Suspense>` is not boot-only. It wraps the `Stack`, so
 * it is the fallback for *any* suspension anywhere inside it for the life of
 * the session — and a screen that suspends without a boundary of its own (a
 * lazy route, a component with a `useSuspenseQuery` and no gate) would, with
 * the cover wired in directly, replace the reader's page with a full-screen
 * branded cover captioned `Opening Journiful`. That is worse than the line it
 * replaced, and it would be a bug nobody could reproduce on demand.
 *
 * So the answer to "is this the boot?" is asked here, once, of the one thing
 * that knows: the session. `useAuth()` works in this position because the
 * `<Suspense>` it is rendered into sits inside every provider — `AuthProvider`
 * is above it in the same tree, not beside it.
 *
 * After the boot resolves, the fallback is the line the app has always drawn,
 * which is what a mid-session suspension should be: quiet, and in the screen's
 * own voice rather than the app's launch voice.
 */
export function BootGate({ label }: { label: string }) {
  const { status } = useAuth();
  if (status === "restoring") return <BootCover label={label} />;
  return <LoadingBlock label={label} />;
}
