import { beforeEach, describe, expect, it, vi } from "vitest";

const { setDemoUserCalls } = vi.hoisted(() => ({
  setDemoUserCalls: [] as Array<unknown>,
}));

// A pure stub: the real `@/lib/authStore` pulls react-native (no node
// build), and this suite only needs the seam `installEarly` writes
// through — whether the demo user was set, and with what.
vi.mock("@/lib/authStore", () => ({
  setDemoAuthUser: (user: unknown) => {
    setDemoUserCalls.push(user);
  },
}));

describe("the demo early install", () => {
  beforeEach(async () => {
    vi.resetModules();
    setDemoUserCalls.length = 0;
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    adapter.resetDemoLog();
  });

  async function freshEarly() {
    const early = await import("@/lib/demo/installEarly");
    early.resetDemoEarlyForTests();
    return early;
  }

  it("does nothing on a non-demo route: no fetch patch, no auth override", async () => {
    vi.stubGlobal("window", { location: { pathname: "/trips", search: "" } });
    const before = globalThis.fetch;
    const early = await freshEarly();
    // The module self-installs on import; on /trips it must decline.
    expect(setDemoUserCalls.length).toBe(0);
    expect(globalThis.fetch).toBe(before);
    expect(early.installDemoEarly()).toBe(false);
    expect(globalThis.fetch).toBe(before);
    expect(setDemoUserCalls.length).toBe(0);
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    vi.unstubAllGlobals();
  });

  it("installs both fetch and the demo user on /demo", async () => {
    vi.stubGlobal("window", { location: { pathname: "/demo", search: "" } });
    const before = globalThis.fetch;
    const early = await freshEarly();
    // Import already self-installed; the explicit call is a safe no-op.
    expect(early.installDemoEarly()).toBe(true);
    expect(globalThis.fetch).not.toBe(before);
    // The import self-installs, then the reset in `freshEarly` lets the
    // explicit call install once more: what matters is that the demo
    // user was set, with the fixture's traveler identity.
    expect(setDemoUserCalls.length).toBeGreaterThanOrEqual(1);
    expect(setDemoUserCalls[0]).toMatchObject({ id: "demo-viewer" });
    // The served store answers the invite preview offline.
    const res = await fetch(
      "http://localhost:8000/api/invitations/demo-invitation-cabo/preview",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    vi.unstubAllGlobals();
  });

  it("stays installed across a refresh on the demo trip page", async () => {
    // The demo entry renders the trip at `/demo?id=demo-trip-cabo`; a
    // refresh cold-boots there, with no `/demo` mounted — the gate
    // matches the demo trip id in the query so the demo environment
    // survives the refresh instead of dumping the visitor home.
    vi.stubGlobal("window", {
      location: { pathname: "/trips/detail", search: "?id=demo-trip-cabo" },
    });
    const before = globalThis.fetch;
    const early = await freshEarly();
    expect(early.installDemoEarly()).toBe(true);
    expect(globalThis.fetch).not.toBe(before);
    expect(setDemoUserCalls.length).toBeGreaterThanOrEqual(1);
    const res = await fetch(
      "http://localhost:8000/api/trips/demo-trip-cabo",
    );
    expect(res.status).toBe(200);
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    vi.unstubAllGlobals();
  });

  it("is idempotent: a second call does not double-wrap fetch", async () => {
    vi.stubGlobal("window", { location: { pathname: "/demo", search: "" } });
    const early = await freshEarly();
    expect(early.installDemoEarly()).toBe(true);
    const wrapped = globalThis.fetch;
    const calls = setDemoUserCalls.length;
    expect(early.installDemoEarly()).toBe(true);
    expect(globalThis.fetch).toBe(wrapped);
    expect(setDemoUserCalls.length).toBe(calls);
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    vi.unstubAllGlobals();
  });

  it("matches /demo subpaths and every demo sheet refresh, but not lookalikes", async () => {
    vi.stubGlobal("window", { location: { pathname: "/trips", search: "" } });
    const early = await freshEarly();
    expect(early.isDemoPath("/demo")).toBe(true);
    expect(early.isDemoPath("/demo/trips")).toBe(true);
    expect(early.isDemoPath("/demo", "?id=demo-trip-cabo")).toBe(true);
    // Every route the trip screen can push to carries the trip id, so a
    // refresh on any of them reinstalls — while `/demo` stays mounted
    // underneath during the walk itself.
    for (const route of [
      "/trips/detail",
      "/trips/events/detail",
      "/trips/stay/detail",
      "/trips/members",
      "/trips/members/detail",
      "/trips/travel",
      "/trips/travel/detail",
      "/trips/travel/form",
      "/trips/settings",
    ]) {
      expect(early.isDemoPath(route, "?id=demo-trip-cabo")).toBe(true);
    }
    // A real trip's deep link must never install the fixture.
    expect(early.isDemoPath("/trips/detail", "?id=some-real-trip")).toBe(
      false,
    );
    expect(early.isDemoPath("/trips/members", "?id=some-real-trip")).toBe(
      false,
    );
    expect(early.isDemoPath("/trips/detail")).toBe(false);
    expect(early.isDemoPath("/demoist")).toBe(false);
    expect(early.isDemoPath("/trips")).toBe(false);
    expect(early.isDemoPath("/")).toBe(false);
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    vi.unstubAllGlobals();
  });
});
