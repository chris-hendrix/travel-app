import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Who ends a session, and with what.
 *
 * `__tests__/auth-signout.test.ts` and `__tests__/account.test.ts` call
 * their seam directly, so they pin the order inside it and nothing about
 * the wiring around it. The facts that keep a session-ending from being a
 * local-state-only reset are one line each, and none of them is reachable
 * from a plain node render: the provider needs a navigator above it, and
 * the layout is a route file.
 *
 * - `AuthProvider.signOut` hands its `leaveRoutes` prop to `endSession`,
 *   so the screens the session was showing actually go.
 * - `AuthProvider.deleteAccount` hands the same prop to the account
 *   deletion's seam, which is the sibling path that had the hazard left.
 * - `app/_layout.tsx` supplies that prop, and it pops the stack before it
 *   replaces — a `replace` alone swaps the top screen and leaves the list
 *   behind it rebuilding the query whose cache was just emptied.
 * - The 401 recovery listener passes no `leaveRoutes`, on purpose: the
 *   auth flow's own guards decide where a signed-out reader belongs.
 *
 * A missing prop fails nothing else. Sign-out would still reset the state
 * and drop the token, and the session's screens would simply stay mounted
 * over an emptied cache — which is the failure this whole branch is about.
 * So it is asserted against source, the established
 * `demo-session-gates.test.ts` / `expo-policy.test.ts` pattern.
 */

const mobileDir = path.resolve(__dirname, "..");

function source(rel: string): string {
  return fs.readFileSync(path.join(mobileDir, rel), "utf8");
}

describe("the session-ending seams are wired, not only ordered", () => {
  it("AuthProvider hands its leaveRoutes to endSession", () => {
    expect(source("lib/authStore.tsx")).toContain(
      "() => endSession(queryClient, resetSessionState, leaveRoutes)",
    );
  });

  it("AuthProvider hands the same leaveRoutes to the account deletion", () => {
    // `lib/account.ts` leaves the session's screens before it drops the
    // token, so the deleted account's trips list does not stay mounted
    // behind `/login` rebuilding the list the clear emptied.
    expect(source("lib/authStore.tsx")).toContain(
      "() => deleteAccountApi(queryClient, resetSessionState, leaveRoutes)",
    );
  });

  it("the 401 recovery listener takes the ordering without the leaving", () => {
    // Two arguments: `endSession`'s routes step would take a 401'd person
    // out of the auth flow whose own guards decide where a signed-out
    // reader belongs, and the auth journey's guard step failed on exactly
    // that when the two were wired together.
    expect(source("lib/authStore.tsx")).toContain(
      "void endSession(queryClient, resetSessionState);",
    );
  });

  it("app/_layout.tsx supplies the prop, and the leaving pops the stack", () => {
    const layout = source("app/_layout.tsx");
    expect(layout).toContain(
      "<AuthProvider leaveRoutes={leaveSessionRoutes}>",
    );
    // The pop is the part that matters, and the destination is the screen
    // the flow can be entered from again.
    expect(layout).toContain("router.dismissAll()");
    expect(layout).toContain('router.replace("/login")');
  });
});
