/**
 * F1 RED: a freeText dropdown whose value is the typed text must show
 * the raw text, not the quoted label — and a second keystroke must not
 * nest quotes. `Dropdown` is a React Native component with no test
 * harness on purpose, so the rule it must follow lives here as the pure
 * helper it reads (the `lib/dropdown.ts` precedent).
 */

import { describe, expect, it } from "vitest";
import { displayTextForValue } from "@/lib/dropdown";

const typedRow = {
  value: "La Bod",
  label: '"La Bod"',
  fieldText: "La Bod",
};

describe("displayTextForValue", () => {
  it("prefers fieldText so a freeText value shows raw text, not quotes", () => {
    expect(displayTextForValue([typedRow], "La Bod")).toBe("La Bod");
  });

  it("a second keystroke still shows raw text, never nested quotes", () => {
    const retyped = {
      value: "La Bode",
      label: '"La Bode"',
      fieldText: "La Bode",
    };
    expect(displayTextForValue([retyped], "La Bode")).toBe("La Bode");
    expect(displayTextForValue([retyped], "La Bode")).not.toContain('"');
  });

  it("falls back to label, then value, then empty", () => {
    expect(
      displayTextForValue([{ value: "ChIJ1", label: "La Bodega" }], "ChIJ1"),
    ).toBe("La Bodega");
    expect(displayTextForValue([], "typed prose")).toBe("typed prose");
    expect(displayTextForValue([], null)).toBe("");
  });
});
