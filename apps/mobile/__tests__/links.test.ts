import { describe, expect, it } from "vitest";
import {
  instagramUrl,
  mapsSearchUrl,
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
