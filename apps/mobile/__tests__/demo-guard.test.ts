import { describe, expect, it } from "vitest";
import { DEMO_TRIP_IDS } from "@/lib/demo";
import {
  DEMO_APP_ROUTES,
  DEMO_PUBLIC_ROUTES,
  demoIdFrom,
  isDemoAllowedRoute,
  isDemoAppRoute,
  isDemoPublicRoute,
  normalizeDemoPath,
  shouldReenterDemo,
} from "@/lib/demo/guard";

/**
 * The demo allowlist, pinned pure (no renderer): the demo scope the
 * adapter serves, the public pages that must never bounce, and every
 * genuinely-absent surface that must end at `/login`.
 */
describe("the demo allowlist", () => {
  it("serves the demo scope: entry, reads, and working writes", () => {
    for (const route of [
      "/demo",
      "/trips/detail",
      "/trips/events/detail",
      "/trips/stay/detail",
      "/trips/members",
      "/trips/members/detail",
      "/trips/travel",
      "/trips/travel/detail",
      // Reachable from screens the demo renders AND served by the
      // adapter (the travel form's POST, the settings reads/writes),
      // so bouncing here would be our own dead end, not an honest one.
      "/trips/travel/form",
      "/trips/settings",
    ]) {
      expect(isDemoAppRoute(route)).toBe(true);
      expect(isDemoAllowedRoute(route)).toBe(true);
    }
  });

  it("never bounces the public pages", () => {
    for (const route of [
      "/",
      "/login",
      "/verify",
      "/complete-profile",
      "/invite",
      "/privacy",
      "/terms",
      "/sms-terms",
      "/+not-found",
    ]) {
      expect(isDemoPublicRoute(route)).toBe(true);
      expect(isDemoAllowedRoute(route)).toBe(true);
      expect(isDemoAppRoute(route)).toBe(false);
    }
  });

  it("leaves out the genuinely-absent surfaces (they go to /login)", () => {
    for (const route of [
      // The trip list: the demo opens on the trip, not a list.
      "/trips",
      // Creating a trip needs a real account.
      "/trips/new",
      "/trips/edit",
      // Inviting people is unserved and unreachable as the traveler.
      "/trips/invite",
      "/trips/members/new",
      // Organizer-only authoring: no door renders for the traveler.
      "/trips/events/new",
      "/trips/events/edit",
      "/trips/stay/new",
      "/trips/stay/edit",
      // Chrome doors onto unserved screens.
      "/notifications",
      "/profile",
      // Admin and the lab.
      "/admin/users",
      "/admin/users/detail",
      "/design",
    ]) {
      expect(isDemoAllowedRoute(route)).toBe(false);
    }
  });

  it("reads trailing slashes as their route", () => {
    expect(normalizeDemoPath("/demo/")).toBe("/demo");
    expect(normalizeDemoPath("/")).toBe("/");
    expect(isDemoAppRoute("/demo/")).toBe(true);
    expect(isDemoAllowedRoute("/login/")).toBe(true);
  });

  it("keeps the two lists disjoint", () => {
    for (const route of DEMO_APP_ROUTES) {
      expect(DEMO_PUBLIC_ROUTES).not.toContain(route);
    }
  });

  it("re-enters only a demo sheet URL carrying a demo trip id", () => {
    // Browser-back into a sheet after teardown: walk back through
    // the entry, whose mount reinstalls the demo environment. Every
    // demo trip re-enters on its own id, not just the first card.
    for (const id of DEMO_TRIP_IDS) {
      expect(shouldReenterDemo("/trips/detail", id)).toBe(true);
      expect(shouldReenterDemo("/trips/members", id)).toBe(true);
      expect(demoIdFrom(id)).toBe(id);
    }
    expect(shouldReenterDemo("/trips/detail/", DEMO_TRIP_IDS[0])).toBe(
      true,
    );
    // `/demo` installs on its own mount; a real trip's sheet, a
    // lookalike id, a missing id, and a non-demo route never bounce.
    expect(shouldReenterDemo("/demo", DEMO_TRIP_IDS[0])).toBe(false);
    expect(shouldReenterDemo("/trips/detail", "some-real-trip")).toBe(
      false,
    );
    expect(shouldReenterDemo("/trips/detail", "demo-trip-cabo-evil")).toBe(
      false,
    );
    expect(shouldReenterDemo("/trips/detail", undefined)).toBe(false);
    expect(shouldReenterDemo("/trips", DEMO_TRIP_IDS[0])).toBe(false);
    expect(shouldReenterDemo("/login", DEMO_TRIP_IDS[0])).toBe(false);
  });

  it("names the demo trip a route's params carry, and nothing else", () => {
    // The id the re-entry interpolates into `/demo?id=…`: a repeated
    // `?id=` arrives as an array (first element wins), and anything
    // outside the demo set is null — which is what keeps the guard
    // from ever carrying a real trip id into the demo entry.
    expect(demoIdFrom([DEMO_TRIP_IDS[1], "x"])).toBe(DEMO_TRIP_IDS[1]);
    expect(demoIdFrom("some-real-trip")).toBeNull();
    expect(demoIdFrom(["some-real-trip"])).toBeNull();
    expect(demoIdFrom(undefined)).toBeNull();
    expect(demoIdFrom(null)).toBeNull();
    expect(demoIdFrom(["demo-trip-cabo-evil"])).toBeNull();
  });
});
