import { describe, expect, it } from "vitest";
import {
  instagramUrl,
  mapsSearchUrl,
  placeCopyText,
  placeMapsUrl,
  placeQuery,
  venmoUrl,
} from "@/lib/links";

describe("placeQuery", () => {
  it("adds the trip so a name lands on the right one of them", () => {
    expect(placeQuery("Trattoria Nuova", "Mallorca")).toBe(
      "Trattoria Nuova, Mallorca",
    );
  });

  it("leaves the place alone with nothing to disambiguate against", () => {
    expect(placeQuery("Trattoria Nuova")).toBe("Trattoria Nuova");
    expect(placeQuery("Trattoria Nuova", null)).toBe("Trattoria Nuova");
    expect(placeQuery("  Trattoria Nuova  ", "   ")).toBe("Trattoria Nuova");
  });

  it("does not say where twice", () => {
    // A trip whose destination is already in the place name — the common
    // case for a location field that autocompleted from Places.
    expect(placeQuery("Mallorca, Spain", "Mallorca")).toBe("Mallorca, Spain");
    expect(placeQuery("Trattoria Nuova, Mallorca", "mallorca")).toBe(
      "Trattoria Nuova, Mallorca",
    );
  });
});

describe("placeCopyText", () => {
  it("copies the address, which is the string somebody pastes", () => {
    expect(
      placeCopyText(
        "Hotel Hacienda Todos Los Santos",
        "Benito Juárez, Todos Santos, BCS, Mexico",
      ),
    ).toBe("Benito Juárez, Todos Santos, BCS, Mexico");
  });

  it("falls back to the name for a place with no address", () => {
    // A typed place, and a travel where, which files the provider's whole
    // reading in one string with the address already in it.
    expect(placeCopyText("Konoba Free Text")).toBe("Konoba Free Text");
    expect(placeCopyText("Konoba Free Text", "   ")).toBe("Konoba Free Text");
  });

  it("trims, so nothing lands on the clipboard with padding on it", () => {
    expect(
      placeCopyText(
        "  Casa Verde  ",
        "  Calle del Sol 12, Cabo San Lucas, Mexico  ",
      ),
    ).toBe("Calle del Sol 12, Cabo San Lucas, Mexico");
  });
});

describe("mapsSearchUrl", () => {
  it("builds a Maps search, with the query escaped", () => {
    expect(mapsSearchUrl("Trattoria Nuova, Mallorca")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Trattoria%20Nuova%2C%20Mallorca",
    );
  });

  it("escapes what would otherwise break or smuggle into the URL", () => {
    const url = mapsSearchUrl("Bar & Grill #2/3?x=1");
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(
      true,
    );
    expect(url).not.toContain("&query=Bar & Grill");
    expect(url).toContain(encodeURIComponent("Bar & Grill #2/3?x=1"));
  });
});

describe("placeMapsUrl", () => {
  it("pins the link to the place id", () => {
    const url = placeMapsUrl("ChIJN1t_tDeuEmsRUsoyG83frY", "La Bodega, S\u00f3ller");
    expect(url).toContain("query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY");
    expect(url).toContain(`query=${encodeURIComponent("La Bodega, S\u00f3ller")}`);
  });

  it("falls back to a plain search with no place id", () => {
    expect(placeMapsUrl(null, "La Bodega, S\u00f3ller")).toBe(
      mapsSearchUrl("La Bodega, S\u00f3ller"),
    );
    expect(placeMapsUrl(undefined, "La Bodega, S\u00f3ller")).toBe(
      mapsSearchUrl("La Bodega, S\u00f3ller"),
    );
  });
});

describe("handle links", () => {
  it("builds a profile for each platform", () => {
    expect(venmoUrl("dana-mercer")).toBe("https://venmo.com/u/dana-mercer");
    expect(instagramUrl("dana.mercer")).toBe(
      "https://instagram.com/dana.mercer",
    );
  });

  it("takes the @ off, because a URL with one is a 404", () => {
    expect(venmoUrl("@dana-mercer")).toBe("https://venmo.com/u/dana-mercer");
    expect(instagramUrl("@dana.mercer")).toBe(
      "https://instagram.com/dana.mercer",
    );
  });

  it("trims what a paste brings along", () => {
    expect(instagramUrl("  @dana.mercer  ")).toBe(
      "https://instagram.com/dana.mercer",
    );
  });
});
