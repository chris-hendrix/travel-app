import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSignedIn,
  setSignedIn,
  subscribe,
} from "@/lib/sessionFlag";

// The flag is a module singleton, so each case starts from signed out.
beforeEach(() => {
  setSignedIn(false);
});

describe("sessionFlag", () => {
  it("starts signed out", () => {
    expect(isSignedIn()).toBe(false);
  });

  it("reports what it was last told", () => {
    setSignedIn(true);
    expect(isSignedIn()).toBe(true);
    setSignedIn(false);
    expect(isSignedIn()).toBe(false);
  });

  it("notifies subscribers once per change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    setSignedIn(true);
    setSignedIn(true); // redundant: no second notification
    setSignedIn(false);

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    subscribe(listener)();
    setSignedIn(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
