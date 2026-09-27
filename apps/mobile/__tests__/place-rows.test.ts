import { describe, expect, it } from "vitest";
import { placeRows } from "@/lib/place-rows";

describe("placeRows", () => {
  it("shows both rows when both snapshots are present", () => {
    expect(
      placeRows({
        placeName: "La Bodega",
        placeAddress: "Carrer de la Mar 14, 07100 Sóller",
      }),
    ).toEqual({
      name: "La Bodega",
      address: "Carrer de la Mar 14, 07100 Sóller",
    });
  });

  it("shows only the Place row when the address is missing", () => {
    expect(
      placeRows({ placeName: "La Bodega", placeAddress: null }),
    ).toEqual({ name: "La Bodega", address: null });
  });

  it("shows only the Address row when the name is missing", () => {
    expect(
      placeRows({
        placeName: null,
        placeAddress: "Carrer de la Mar 14, 07100 Sóller",
      }),
    ).toEqual({
      name: null,
      address: "Carrer de la Mar 14, 07100 Sóller",
    });
  });

  it("hides both rows when neither snapshot is present", () => {
    expect(placeRows({ placeName: null, placeAddress: null })).toEqual({
      name: null,
      address: null,
    });
  });

  it("reads blank strings as missing", () => {
    expect(placeRows({ placeName: "  ", placeAddress: "" })).toEqual({
      name: null,
      address: null,
    });
  });

  it("a pre-feature stay falls back to its own address column", () => {
    expect(
      placeRows({
        placeName: null,
        placeAddress: null,
        address: "Carrer de la Mar 14, 07100 Sóller",
      }),
    ).toEqual({
      name: null,
      address: "Carrer de la Mar 14, 07100 Sóller",
    });
  });

  it("the snapshot wins over a stay's own address column", () => {
    expect(
      placeRows({
        placeName: "La Bodega",
        placeAddress: "Carrer de la Mar 14, 07100 Sóller",
        address: "Somewhere older, Sóller",
      }),
    ).toEqual({
      name: "La Bodega",
      address: "Carrer de la Mar 14, 07100 Sóller",
    });
  });
});
