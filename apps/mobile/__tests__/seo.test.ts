import { describe, expect, it } from "vitest";
import { SEO_ORIGIN, SEO_ROUTES, seoFor } from "@/lib/seo";

describe("seoFor landing", () => {
  it("describes '/'", () => {
    const seo = seoFor("/");
    expect(seo.title).toBe(
      "Journiful: an itinerary your friends will actually read",
    );
    expect(seo.description).toBe(
      "Plan a trip with your group: invite everyone by text, keep one shared itinerary, and see who is coming.",
    );
    expect(seo.indexable).toBe(true);
  });
});

describe("seoFor legal documents", () => {
  it.each(["/terms", "/privacy", "/sms-terms"])(
    "keeps %s in the index",
    (path) => {
      const seo = seoFor(path);
      expect(seo.indexable).toBe(true);
      expect(seo.title.length).toBeGreaterThan(0);
      expect(seo.description.length).toBeGreaterThan(0);
      expect(seo.canonicalUrl).toBe(SEO_ORIGIN + path);
    },
  );
});

describe("seoFor private routes", () => {
  it.each(["/trips", "/invite"])("keeps %s out of the index", (path) => {
    const seo = seoFor(path);
    expect(seo.indexable).toBe(false);
    expect(seo.robots).toBe("noindex, nofollow");
    expect(seo.canonicalUrl).toBe(SEO_ORIGIN + path);
  });
});

describe("SEO_ROUTES copy rules", () => {
  it("keeps titles and descriptions free of em dashes, non-empty, and unique", () => {
    // House style bans the em dash in metadata copy, so the lint pins it here.
    const entries = Object.values(SEO_ROUTES);
    for (const entry of entries) {
      expect(entry.title).not.toContain("\u2014");
      expect(entry.description).not.toContain("\u2014");
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
    const titles = entries.map((entry) => entry.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
