/**
 * Specs for the two-line suggestion contract (Phase 7, Task 2).
 *
 * A place row reads as name-then-address; a one-line caller (the invite
 * picker, the member picker) renders a single line. The row is labelled
 * with its primary, and the secondary survives to the list untouched.
 * Pure-contract specs — `apps/mobile` has no component test harness on
 * purpose, so rendering itself is the manual lab pass (Task 7).
 */

import { describe, expect, it } from "vitest";
import {
  entryAccessibilityLabel,
  filterPickerEntries,
  type PickerEntry,
} from "@/lib/dropdown";

describe("two-line suggestion contract", () => {
  it("a suggestion with a secondary keeps both strings and is labelled with the primary", () => {
    const entry: PickerEntry = {
      value: "ChIJ1",
      label: "La Bodega",
      secondary: "Carrer de la Mar 14, Sóller",
    };
    const kept = filterPickerEntries([entry], "La Bod", true);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.label).toBe("La Bodega");
    expect(kept[0]?.secondary).toBe("Carrer de la Mar 14, Sóller");
    expect(entryAccessibilityLabel(entry)).toBe("La Bodega");
  });

  it("a suggestion without a secondary is a single line", () => {
    const entry: PickerEntry = { value: "u1", label: "Sam Ortiz" };
    expect(entry.secondary).toBeUndefined();
    expect(entryAccessibilityLabel(entry)).toBe("Sam Ortiz");
  });
});
