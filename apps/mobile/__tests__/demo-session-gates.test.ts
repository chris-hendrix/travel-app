import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { isDemoIdentity, type AuthUser } from "@/lib/authStore";
import { DEMO_AUTH_USER } from "@/lib/demo";

/**
 * The demo identity is viewer identity, never a session.
 *
 * The bug: the demo installs the fixture traveler through
 * `setDemoAuthUser()` so the real trip screen resolves offline, and the
 * scope is torn down only after `/demo` unmounts. A real route that
 * redirects on a session and renders while the fixture is still
 * installed — the browser back button out of `/demo`, or the header
 * wordmark home link — reads the fixture as signed in and throws the
 * visitor to `/trips`, which by then has no session and renders the
 * offline error screen. That reads exactly like a dead back button.
 *
 * The fix is one predicate, `isDemoIdentity`, that every real route
 * redirecting on a session uses — `/`, `/login`, `/verify`,
 * `/complete-profile` — while the demo's own screens keep reading the
 * fixture as viewer identity untouched.
 *
 * Suite shape follows the repo's constraints (plain node, no
 * renderer): the predicate is exercised for real, and the wiring is
 * asserted against source (the established `expo-policy.test.ts`
 * pattern).
 */

const mobileDir = path.resolve(__dirname, "..");

function source(rel: string): string {
  return fs.readFileSync(path.join(mobileDir, rel), "utf8");
}

function demoUser(): AuthUser {
  return { ...DEMO_AUTH_USER };
}

function genuineUser(): AuthUser {
  return {
    id: "user-1",
    phoneNumber: "+15551234567",
    displayName: "Sam",
    profileComplete: true,
  };
}

describe("isDemoIdentity separates the fixture from a real session", () => {
  it("matches the fixture traveler the demo installs", () => {
    expect(isDemoIdentity(demoUser())).toBe(true);
  });

  it("does not match a genuine session, null, or undefined", () => {
    expect(isDemoIdentity(genuineUser())).toBe(false);
    expect(isDemoIdentity(null)).toBe(false);
    expect(isDemoIdentity(undefined)).toBe(false);
  });

  it("does not match a user who merely shares the fixture's name", () => {
    expect(
      isDemoIdentity({ ...genuineUser(), displayName: "You" }),
    ).toBe(false);
  });
});

describe("every real session redirect ignores the demo identity", () => {
  it("the landing keeps a genuine session off the pitch but not the fixture", () => {
    const index = source("app/index.tsx");
    expect(index).toContain("isDemoIdentity");
    expect(index).toMatch(
      /if \(status === "signed-in" && user && !isDemoIdentity\(user\)\)/,
    );
    // The genuine-session redirect is untouched.
    expect(index).toContain("destinationForRequiresProfile");
  });

  it("login keeps a genuine session off the form but not the fixture", () => {
    const login = source("app/login.tsx");
    expect(login).toContain("isDemoIdentity");
    expect(login).toMatch(
      /if \(user && !isDemoIdentity\(user\)\) return <Redirect href="\/trips" \/>;/,
    );
  });

  it("verify moves a genuine session past the code screen but not the fixture", () => {
    const verify = source("app/verify.tsx");
    expect(verify).toContain("isDemoIdentity");
    // The fixture reads as nobody signed in, for the effect and both
    // redirects alike.
    expect(verify).toContain("const sessionUser = isDemoIdentity(user)");
    expect(verify).toContain('if (sessionUser?.profileComplete)');
    expect(verify).toContain('if (sessionUser) return <Redirect href=');
    // The genuine-session destinations are untouched.
    expect(verify).toContain('<Redirect href="/trips" />');
    expect(verify).toContain('<Redirect href="/complete-profile" />');
  });

  it("complete-profile keeps a genuine session moving but not the fixture", () => {
    const complete = source("app/complete-profile.tsx");
    expect(complete).toContain("isDemoIdentity");
    expect(complete).toContain("const sessionUser = isDemoIdentity(user)");
    expect(complete).toContain('<Redirect href="/trips" />');
    expect(complete).toContain('<Redirect href="/" />');
  });
});

describe("the demo's own screens still read the fixture as identity", () => {
  it("the demo entry still installs the fixture traveler", () => {
    const demo = source("app/demo.tsx");
    expect(demo).toContain("setDemoAuthUser({ ...DEMO_AUTH_USER })");
  });

  it("the real trip screen still resolves the viewer from `user` untouched", () => {
    const detail = source("app/trips/detail.tsx");
    expect(detail).toContain("viewerOf(members, user?.id)");
    // No carve-out here: this is the screen the fixture exists for.
    expect(detail).not.toContain("isDemoIdentity");
  });
});
