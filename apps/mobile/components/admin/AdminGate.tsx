import { Suspense, type ReactNode } from "react";
import { Redirect } from "expo-router";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/authStore";
import { guardDestination } from "@/lib/admin";

/**
 * The one guard both admin routes wear.
 *
 * The guard branches, then a Suspense around the children — TripGate's
 * shape (`components/trip/TripGate.tsx`): the boundary is here because
 * the record screen reads its id with `useLocalSearchParams` inside a
 * Suspense, and the root layout's boundary is the last resort rather
 * than this screen's.
 *
 * The reads live in a CHILD of the gate, never in the component that
 * branches on `useAuth()`: hooks run on every render including the
 * blocked one, and `useInfiniteQuery` fires on mount. The shape is
 * `AdminUsersScreen` = `AdminGate` > `AdminUsersList`.
 */
export function AdminGate({
  label,
  children,
}: {
  /** What is loading, never "Loading…" on its own. */
  label: string;
  children: ReactNode;
}) {
  const { status, isAdmin } = useAuth();
  const destination = guardDestination({ status, isAdmin });
  if (destination === null) {
    return <LoadingBlock label="Checking your account" />;
  }
  if (destination === "/") {
    return <Redirect href="/" />;
  }
  if (destination === "/trips") {
    return <Redirect href="/trips" />;
  }
  return (
    <Suspense fallback={<LoadingBlock label={label} />}>
      {children}
    </Suspense>
  );
}
