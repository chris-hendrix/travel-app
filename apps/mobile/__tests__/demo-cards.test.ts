import { describe, expect, it } from "vitest";
import {
  DEMO_TRIP_IDS,
  demoHrefFor,
  demoTripCards,
} from "@/lib/demo";

/**
 * The landing's card selector: pure, pinned to the card order
 * (bachelor, wedding, reunion), carrying exactly what the card
 * needs — and three distinct covers, or three cards read as one bug.
 */
describe("the demo cards", () => {
  it("returns three entries in the pinned order with the card's shape", () => {
    const cards = demoTripCards(new Date("2026-10-06T12:00:00.000Z"));
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.id)).toEqual([...DEMO_TRIP_IDS]);
    expect(cards.map((card) => card.occasion)).toEqual([
      "bachelor",
      "wedding",
      "reunion",
    ]);
    for (const card of cards) {
      expect(typeof card.title).toBe("string");
      expect(card.title.length).toBeGreaterThan(0);
      expect(typeof card.location).toBe("string");
      expect(typeof card.startDate).toBe("string");
      expect(typeof card.endDate).toBe("string");
      expect(card.href).toBe(`/demo?id=${card.id}`);
    }
  });

  it("gives each card its own cover", () => {
    const cards = demoTripCards(new Date("2026-10-06T12:00:00.000Z"));
    expect(new Set(cards.map((card) => card.coverKind)).size).toBe(3);
  });

  it("builds hrefs that name the trip id exactly", () => {
    expect(demoHrefFor(DEMO_TRIP_IDS[0]!)).toBe(
      `/demo?id=${DEMO_TRIP_IDS[0]!}`,
    );
    expect(demoHrefFor("demo-trip-cabo-evil")).toBe(
      "/demo?id=demo-trip-cabo-evil",
    );
  });
});
