import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoTrip } from "@/lib/demo";

const { setDemoUserCalls, demoSession } = vi.hoisted(() => ({
  setDemoUserCalls: [] as Array<unknown>,
  demoSession: { current: null as unknown },
}));

// A pure stub: the real `@/lib/authStore` pulls react-native (no node
// build), and this suite only needs the seam the installs write
// through — whether the demo user was set or cleared. Stateful, so
// the scope's own "already installed" check reads back what the
// installs wrote, exactly like the real store.
vi.mock("@/lib/authStore", () => ({
  setDemoAuthUser: (user: unknown) => {
    demoSession.current = user;
    setDemoUserCalls.push(user);
  },
  getDemoAuthUser: () => demoSession.current,
}));

vi.mock("expo-router", () => ({
  usePathname: () => "/demo",
  useGlobalSearchParams: () => ({}),
  useRouter: () => ({ replace: () => {} }),
  Link: () => null,
  Redirect: () => null,
  Stack: () => null,
  SplashScreen: { preventAutoHideAsync: () => {}, hideAsync: async () => {} },
  useLocalSearchParams: () => ({}),
}));

/**
 * Leaving `/demo` and coming back (browser back, then forward) must
 * reinstall the demo's data layer: the re-entered demo serves its
 * reads locally and never reaches the network.
 *
 * Regression shape: the teardown removes the fetch wrap but a stale
 * installed-flag makes the next install a no-op, so the real trip
 * screen fires a genuine `GET /api/trips/demo-trip-cabo` and shows
 * the failure screen.
 */
describe("the demo install → teardown → install cycle", () => {
  const inner = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    setDemoUserCalls.length = 0;
    demoSession.current = null;
    inner.mockReset();
    inner.mockRejectedValue(new Error("network must never be reached"));
    globalThis.fetch = inner as unknown as typeof fetch;
    const adapter = await import("@/lib/demo/adapter");
    adapter.uninstallDemoFetch();
    adapter.resetDemoLog();
  });

  it("adapter cycle: install → uninstall → install serves locally with no egress", async () => {
    const adapter = await import("@/lib/demo/adapter");
    const store = () => adapter.createDemoStore([buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"))]);

    adapter.installDemoFetch(store());
    adapter.uninstallDemoFetch();
    adapter.installDemoFetch(store());

    const res = await fetch("http://localhost:8000/api/trips/demo-trip-cabo");
    expect(res.status).toBe(200);
    expect(inner).not.toHaveBeenCalled();
    expect(
      adapter.getDemoLog().some((entry) => entry.path === "/trips/demo-trip-cabo"),
    ).toBe(true);

    adapter.uninstallDemoFetch();
  });

  it("repeated teardowns are safe and restore the real fetch exactly once", async () => {
    const adapter = await import("@/lib/demo/adapter");
    const real = globalThis.fetch;
    adapter.installDemoFetch(
      adapter.createDemoStore([buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"))]),
    );
    adapter.uninstallDemoFetch();
    adapter.uninstallDemoFetch();
    expect(globalThis.fetch).toBe(real);
    expect(inner).not.toHaveBeenCalled();
  });

  it("early install re-arms after teardown: back-then-forward reinstalls", async () => {
    vi.stubGlobal("window", { location: { pathname: "/demo", search: "" } });
    const early = await import("@/lib/demo/installEarly");
    early.resetDemoEarlyForTests();
    const adapter = await import("@/lib/demo/adapter");

    // First visit: the module self-install plus the entry's own
    // install (mirroring `app/demo.tsx`).
    expect(early.installDemoEarly()).toBe(true);
    adapter.installDemoFetch(
      adapter.createDemoStore([buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"))]),
    );
    const firstWrapped = globalThis.fetch;
    expect(firstWrapped).not.toBe(inner);

    // Leaving: exactly what the entry's unmount cleanup tears down.
    adapter.uninstallDemoFetch();
    expect(globalThis.fetch).toBe(inner);

    // Coming back through the early path alone (a refresh or a
    // forward navigation into a demo URL before `/demo` remounts):
    // a stale once-flag must not turn this into a no-op — the fetch
    // interceptor has to be back in place and the trip read served
    // locally, never through the real fetch.
    expect(early.installDemoEarly()).toBe(true);
    expect(globalThis.fetch).not.toBe(inner);
    const res = await fetch("http://localhost:8000/api/trips/demo-trip-cabo");
    expect(res.status).toBe(200);
    expect(inner).not.toHaveBeenCalled();

    adapter.uninstallDemoFetch();
    vi.unstubAllGlobals();
  });

  it("ensureDemoScope reinstalls the torn-down scope: the forward-navigation case", async () => {
    // On web the stack keeps `/demo` mounted while hidden, so
    // browser-back tears the scope down through the guard WITHOUT
    // unmounting the entry — and browser-forward remounts nothing.
    // Standing on `/demo` must therefore imply the scope through
    // the guard's own render, not through a mount that never runs.
    const adapter = await import("@/lib/demo/adapter");
    const guard = await import("@/components/demo/DemoGuard");
    const real = globalThis.fetch;

    // First visit installs (the entry's mount pair).
    adapter.installDemoFetch(
      adapter.createDemoStore([buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"))]),
    );
    demoSession.current = { id: "demo-viewer" };
    expect(globalThis.fetch).not.toBe(real);

    // Leaving for the landing: the guard's pathname effect tears
    // down, while the entry stays mounted (no cleanup runs).
    guard.teardownDemoScope();
    expect(globalThis.fetch).toBe(real);
    expect(demoSession.current).toBe(null);

    // Forward back to `/demo`: no mount, no early self-install —
    // just the guard rendering above the stack.
    guard.ensureDemoScope();
    expect(globalThis.fetch).not.toBe(real);
    expect(demoSession.current).toMatchObject({ id: "demo-viewer" });
    const res = await fetch("http://localhost:8000/api/trips/demo-trip-cabo");
    expect(res.status).toBe(200);
    expect(inner).not.toHaveBeenCalled();

    // Leaving for good still restores everything: no leak.
    guard.teardownDemoScope();
    expect(globalThis.fetch).toBe(real);
    expect(demoSession.current).toBe(null);
  });

  it("ensureDemoScope is a no-op while installed: in-demo writes survive", async () => {
    const adapter = await import("@/lib/demo/adapter");
    const guard = await import("@/components/demo/DemoGuard");

    adapter.installDemoFetch(
      adapter.createDemoStore([buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"))]),
    );
    demoSession.current = { id: "demo-viewer" };
    const wrapped = globalThis.fetch;
    const calls = setDemoUserCalls.length;

    // An in-demo write (answering the RSVP)…
    const rsvp = await fetch("http://localhost:8000/api/trips/demo-trip-cabo/rsvp", {
      method: "POST",
      body: JSON.stringify({ status: "going" }),
    });
    expect(rsvp.status).toBe(200);

    // …must survive the guard rendering on every in-demo navigation.
    guard.ensureDemoScope();
    guard.ensureDemoScope();
    expect(globalThis.fetch).toBe(wrapped);
    expect(setDemoUserCalls.length).toBe(calls);
    const members = (await (
      await fetch("http://localhost:8000/api/trips/demo-trip-cabo/members")
    ).json()) as { members: Array<{ userId: string; status: string }> };
    expect(
      members.members.find((row) => row.userId === "demo-viewer")?.status,
    ).toBe("going");
    expect(inner).not.toHaveBeenCalled();

    adapter.uninstallDemoFetch();
  });
});
