import { describe, expect, it, vi } from "vitest";
import {
  createTrailingDebounce,
  useDebouncedValue,
} from "@/lib/debounce";
import * as placesDebounce from "@/lib/queries/places";

describe("createTrailingDebounce", () => {
  it("collapses rapid pushes into one settled call with the last value", () => {
    vi.useFakeTimers();
    try {
      const onSettled = vi.fn();
      const debounce = createTrailingDebounce<string>(250, onSettled);
      debounce.push("a");
      debounce.push("ab");
      debounce.push("abc");
      expect(onSettled).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(onSettled).toHaveBeenCalledWith("abc");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the pending call when cancelled", () => {
    vi.useFakeTimers();
    try {
      const onSettled = vi.fn();
      const debounce = createTrailingDebounce<string>(250, onSettled);
      debounce.push("abc");
      debounce.cancel();
      vi.advanceTimersByTime(250);
      expect(onSettled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("places re-export", () => {
  it("still exports both debounce helpers from the places domain", () => {
    expect(placesDebounce.createTrailingDebounce).toBe(
      createTrailingDebounce,
    );
    expect(placesDebounce.useDebouncedValue).toBe(useDebouncedValue);
  });
});
