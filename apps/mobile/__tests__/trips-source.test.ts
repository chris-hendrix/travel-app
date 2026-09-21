import { describe, expect, it } from "vitest";
import type { Trip } from "@/components/trip/TripCard";
import {
  MockTripsSource,
  createMockTripsSource,
  type TripsSource,
} from "@/lib/sources";
import { createTripsStore } from "@/lib/tripsStore";

function trip(id: string, title = id): Trip {
  return {
    id,
    title,
    location: "Nowhere",
    image: "",
    going: 1,
    description: "",
    preferredTimezone: "Europe/Madrid",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  };
}

/** Controllable fake source: records delegation, answers from its pool. */
function fakeSource(seed: Trip[] = [trip("a"), trip("b")]): TripsSource & {
  calls: Array<{ kind: string; id?: string }>;
  pool: Trip[];
} {
  const calls: Array<{ kind: string; id?: string }> = [];
  const pool = [...seed];
  return {
    calls,
    pool,
    list: () => [...pool],
    create: (t: Trip) => {
      calls.push({ kind: "create", id: t.id });
      pool.unshift(t);
    },
    update: (id: string, patch: Partial<Trip>) => {
      calls.push({ kind: "update", id });
      const i = pool.findIndex((t) => t.id === id);
      if (i >= 0) pool[i] = { ...pool[i], ...patch } as Trip;
    },
  };
}

describe("createTripsStore(source)", () => {
  it("reads through the injected source", () => {
    const store = createTripsStore(fakeSource([trip("a"), trip("b")]));
    expect(store.getData().trips.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("delegates create/update to the source", () => {
    const source = fakeSource([trip("a")]);
    const store = createTripsStore(source);
    store.create(trip("z"));
    store.update("a", { title: "renamed" });
    expect(source.calls).toEqual([
      { kind: "create", id: "z" },
      { kind: "update", id: "a" },
    ]);
    expect(store.getData().trips.map((t) => t.id)).toEqual(["z", "a"]);
    expect(
      store.getData().trips.find((t) => t.id === "a")?.title,
    ).toBe("renamed");
  });

  it("notifies subscribers on a write", () => {
    const store = createTripsStore(fakeSource());
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    store.create(trip("z"));
    expect(calls).toBe(1);
    stop();
    store.create(trip("y"));
    expect(calls).toBe(1);
  });
});

describe("MockTripsSource", () => {
  it("is a TripsSource", () => {
    const ids = MockTripsSource.list().map((t) => t.id);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("prepends created trips (newest first)", () => {
    const source = createMockTripsSource([trip("a"), trip("b")]);
    source.create(trip("z"));
    expect(source.list().map((t) => t.id)).toEqual(["z", "a", "b"]);
  });

  it("patches the trip with the matching id on update", () => {
    const source = createMockTripsSource([trip("a"), trip("b")]);
    source.update("b", { title: "renamed" });
    expect(source.list().find((t) => t.id === "b")?.title).toBe("renamed");
    expect(source.list().find((t) => t.id === "a")?.title).toBe("a");
  });
});

describe("store identity", () => {
  it("getActions() keeps its identity across a write", () => {
    const store = createTripsStore(fakeSource());
    const before = store.getActions();
    store.create(trip("z"));
    expect(store.getActions()).toBe(before);
  });

  it("getData() is cached between writes and changes on a real one", () => {
    const store = createTripsStore(fakeSource());
    expect(store.getData()).toBe(store.getData());
    const before = store.getData();
    store.create(trip("z"));
    const after = store.getData();
    expect(after).not.toBe(before);
    expect(after.trips.map((t) => t.id)[0]).toBe("z");
    expect(store.getData()).toBe(after);
  });
});
