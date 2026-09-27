/**
 * Specs for the place picker's row list (Phase 7, Tasks 3–6).
 *
 * The picker offers Google's answer AND the user's own words: live rows
 * first in Google's order, the typed text pinned after them, a loading
 * row in flight, and a failure row when the lookup fails. Pure helper
 * specs — `apps/mobile` has no component test harness on purpose.
 */

import { describe, expect, it } from "vitest";
import {
  GOOGLE_MAPS_ATTRIBUTION,
  placePickerRows,
} from "@/lib/queries/places";
import { filterPickerEntries } from "@/lib/dropdown";

function suggestion(placeId: string, name: string, address: string) {
  return { placeId, name, shortName: name, address, types: [] as string[] };
}

describe("placePickerRows", () => {
  it("pins the typed text after the live results", () => {
    const { rows, hasTypedRow } = placePickerRows({
      suggestions: [
        suggestion("ChIJ1", "La Bodega", "Carrer de la Mar 14, Sóller"),
        suggestion("ChIJ2", "La Bodega d'es Tren", "Carrer de la Mar 3, Sóller"),
      ],
      query: "La Bod",
    });

    expect(hasTypedRow).toBe(true);
    expect(rows.map((row) => row.label)).toEqual([
      "La Bodega",
      "La Bodega d'es Tren",
      '"La Bod"',
    ]);
    expect(rows[0]).toMatchObject({
      value: "ChIJ1",
      secondary: "Carrer de la Mar 14, Sóller",
    });
    expect(rows[rows.length - 1]).toMatchObject({
      value: "La Bod",
      label: '"La Bod"',
      secondary: "Use what you typed",
      fieldText: "La Bod",
    });
  });

  it("offers only the typed row when there are zero results", () => {
    const { rows, hasTypedRow } = placePickerRows({
      suggestions: [],
      query: "La Bod",
    });

    expect(hasTypedRow).toBe(true);
    expect(rows).toEqual([
      {
        value: "La Bod",
        label: '"La Bod"',
        secondary: "Use what you typed",
        fieldText: "La Bod",
      },
    ]);
  });

  it("keeps the typed row alongside the failure row when the lookup fails", () => {
    const { rows } = placePickerRows({
      suggestions: undefined,
      query: "La Bod",
      isError: true,
    });

    expect(rows.map((row) => row.label)).toEqual([
      "Couldn't reach Google Places",
      '"La Bod"',
    ]);
    expect(rows[0]).toMatchObject({ disabled: true });
    expect(rows[rows.length - 1]).toMatchObject({
      value: "La Bod",
      secondary: "Use what you typed",
    });
  });

  it("never offers a hardcoded place", () => {
    const { rows } = placePickerRows({ suggestions: [], query: "Mallorca" });
    const labels = rows.map((row) => row.label);
    expect(labels).not.toContain("Mallorca, Spain");
    expect(labels).not.toContain("Mercat Central");
    expect(rows).toHaveLength(1);
  });

  it("offers nothing for a blank query", () => {
    expect(
      placePickerRows({ suggestions: [], query: "   " }).rows,
    ).toEqual([]);
    expect(
      placePickerRows({ suggestions: [], query: "   " }).hasTypedRow,
    ).toBe(false);
  });

  it("yields a Searching… row in flight and none when healthy", () => {
    const inflight = placePickerRows({
      suggestions: undefined,
      query: "La Bod",
      isFetching: true,
    });
    expect(inflight.rows[0]).toMatchObject({
      label: "Searching…",
      disabled: true,
    });
    expect(inflight.rows[inflight.rows.length - 1]).toMatchObject({
      label: '"La Bod"',
    });

    const healthy = placePickerRows({
      suggestions: [suggestion("ChIJ1", "La Bodega", "Sóller")],
      query: "La Bod",
    });
    expect(
      healthy.rows.some((row) => row.label === "Searching…"),
    ).toBe(false);
    expect(
      healthy.rows.some(
        (row) => row.label === "Couldn't reach Google Places",
      ),
    ).toBe(false);
  });

  it("carries the Google Maps footer for place pickers", () => {
    expect(GOOGLE_MAPS_ATTRIBUTION).toBe("Google Maps");
    expect(
      placePickerRows({ suggestions: [], query: "La Bod" }).footer,
    ).toBe("Google Maps");
  });
});

describe("live rows are never locally filtered", () => {
  it("keeps a live option whose label does not contain the raw query", () => {
    const { rows } = placePickerRows({
      suggestions: [
        suggestion("ChIJ1", "Bodega Sole", "Carrer Major 9, Deià"),
      ],
      query: "xyz",
    });
    const kept = filterPickerEntries(rows, "xyz", true);
    expect(kept.map((row) => row.label)).toContain("Bodega Sole");
  });

  it("still filters one-line option lists by substring", () => {
    const kept = filterPickerEntries(
      [
        { value: "a", label: "Mercat Central" },
        { value: "b", label: "Bodega Sole" },
      ],
      "merc",
      false,
    );
    expect(kept.map((row) => row.label)).toEqual(["Mercat Central"]);
  });
});
