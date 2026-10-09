import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The demo sign-in door: from `/demo`, the header's "Sign in" word must
 * land on `/login` with the phone-number form — never on `/trips`
 * signed out with the fixture traveler still installed.
 *
 * The race: the demo installs the fixture traveler via
 * `setDemoAuthUser()`, and `/demo`'s unmount cleanup runs after
 * `/login` has already redirected on `user`. The fix tears the scope
 * down synchronously in the door's press handler, before navigation
 * lands — the same synchronous teardown `DemoGuard` already performs
 * before its own `router.replace("/login")`.
 *
 * Suite shape follows the repo's constraints (plain node, no
 * renderer): the wiring is asserted against source (the established
 * `expo-policy.test.ts` pattern), and the teardown the door calls is
 * exercised for real with `expo-router` stubbed out.
 */

const mobileDir = path.resolve(__dirname, "..");

function source(rel: string): string {
  return fs.readFileSync(path.join(mobileDir, rel), "utf8");
}

vi.mock("expo-router", () => ({
  usePathname: () => "/login",
  useGlobalSearchParams: () => ({}),
  useRouter: () => ({ replace: () => {} }),
  Link: () => null,
  Redirect: () => null,
  Stack: () => null,
  SplashScreen: { preventAutoHideAsync: () => {}, hideAsync: async () => {} },
  useLocalSearchParams: () => ({}),
}));

const { setDemoUserCalls } = vi.hoisted(() => ({
  setDemoUserCalls: [] as Array<unknown>,
}));

vi.mock("@/lib/authStore", () => ({
  setDemoAuthUser: (user: unknown) => {
    setDemoUserCalls.push(user);
  },
  getDemoAuthUser: () => null,
}));

describe("the demo sign-in door tears down before navigating", () => {
  it("the header's Sign in word calls teardownDemoScope on press", () => {
    const header = source("components/ui/AppHeader.tsx");
    expect(header).toContain("teardownDemoScope");
    // The press handler sits on the door to /login itself — teardown
    // runs as part of the tap, before the navigation lands.
    expect(header).toMatch(
      /<Link href="\/login" asChild onPress=\{\(\) => teardownDemoScope\(\)\}>/,
    );
    // The import is the single shared teardown, not a local copy.
    expect(header).toContain(
      'import { teardownDemoScope } from "@/components/demo/DemoGuard"',
    );
  });

  it("the teardown the door calls is synchronous: identity cleared, fetch restored", async () => {
    vi.resetModules();
    setDemoUserCalls.length = 0;
    const adapter = await import("@/lib/demo/adapter");
    const realFetch = globalThis.fetch;
    adapter.installDemoFetch(adapter.createDemoStore([]));
    expect(globalThis.fetch).not.toBe(realFetch);
    const guard = await import("@/components/demo/DemoGuard");
    // The signature is sync — nothing awaits between the press and
    // the cleared identity.
    expect(guard.teardownDemoScope.constructor.name).not.toBe(
      "AsyncFunction",
    );
    guard.teardownDemoScope();
    expect(setDemoUserCalls).toEqual([null]);
    // And the fetch the demo patched is the real one again.
    expect(globalThis.fetch).toBe(realFetch);
  });
});

describe("a genuine session still redirects off /login", () => {
  it("login.tsx redirects on a real session, ignoring the demo fixture", () => {
    const login = source("app/login.tsx");
    // The real-session redirect is untouched, except that the demo
    // fixture no longer counts as a session: the door-teardown fix
    // could not cover the browser back button, so every real session
    // redirect now shares the one `isDemoIdentity` predicate (see
    // `__tests__/demo-session-gates.test.ts` for the whole class).
    expect(login).toMatch(
      /if \(user && !isDemoIdentity\(user\)\) return <Redirect href="\/trips" \/>;/,
    );
    // The fix lives in the shared predicate, not in a local copy:
    // login learns one predicate, never the demo's teardown or scope.
    expect(login).not.toContain("getDemoAuthUser");
    expect(login).not.toContain("teardownDemoScope");
  });
});
