import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { POICard } from "../poi-card";
import type { POISuggestion, POICategoryKey } from "@journiful/shared/types";

function makePOI(overrides: Partial<POISuggestion> = {}): POISuggestion {
  return {
    sourceId: "fsq-test-1",
    name: "Le Bistro Parisien",
    address: "123 Rue de Rivoli, Paris",
    lat: 48.8566,
    lon: 2.3522,
    distance: 450,
    category: "food_and_drink" as POICategoryKey,
    popularity: null,
    price: null,
    rating: null,
    eventId: null,
    ...overrides,
  };
}

describe("POICard", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
  });

  describe("rendering", () => {
    it("renders the POI name", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} />);
      expect(screen.getByText("Le Bistro Parisien")).toBeDefined();
    });

    it("renders the address when provided", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} />);
      expect(screen.getByText("123 Rue de Rivoli, Paris")).toBeDefined();
    });

    it("renders a placeholder when address is null", () => {
      const poi = makePOI({ address: null });
      render(<POICard poi={poi} onSelect={onSelect} />);
      // Should render an em-dash placeholder to maintain layout height
      expect(screen.getByText("\u2014")).toBeDefined();
      expect(screen.queryByText("123 Rue de Rivoli, Paris")).toBeNull();
    });

    it("renders distance in meters (< 1000m)", () => {
      const poi = makePOI({ distance: 450 });
      render(<POICard poi={poi} onSelect={onSelect} />);
      expect(screen.getByText("450 m")).toBeDefined();
    });

    it("renders distance in km (>= 1000m)", () => {
      const poi = makePOI({ distance: 1800 });
      render(<POICard poi={poi} onSelect={onSelect} />);
      expect(screen.getByText("1.8 km")).toBeDefined();
    });

    it("shows the correct category label", () => {
      const poi = makePOI({ category: "nightlife" });
      render(<POICard poi={poi} onSelect={onSelect} />);
      expect(screen.getByText("Nightlife")).toBeDefined();
    });

    it("has a fixed height class", () => {
      const { container } = render(<POICard poi={makePOI()} onSelect={onSelect} />);
      const card = container.querySelector("button");
      expect(card?.className).toContain("h-36");
    });

    it("has a left border class for the correct category", () => {
      const poi = makePOI({ category: "food_and_drink" });
      const { container } = render(<POICard poi={poi} onSelect={onSelect} />);
      const card = container.querySelector("button");
      expect(card?.className).toContain("border-l-event-food_and_drink");
    });

  });

  describe("interaction", () => {
    it("calls onSelect when clicked", async () => {
      const user = userEvent.setup();
      const poi = makePOI({ sourceId: "fsq-click-test" });
      render(<POICard poi={poi} onSelect={onSelect} />);

      const card = screen.getByRole("button");
      await user.click(card);

      expect(onSelect).toHaveBeenCalledWith(poi);
    });

    it("is a button element for accessibility", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} />);
      const button = screen.getByRole("button");
      expect(button.tagName).toBe("BUTTON");
    });
  });

  describe("category colour mapping", () => {
    it.each([
      ["food_and_drink" as POICategoryKey, "border-l-event-food_and_drink"],
      ["arts_and_entertainment" as POICategoryKey, "border-l-event-arts_and_entertainment"],
      ["outdoors" as POICategoryKey, "border-l-event-outdoors"],
      ["nightlife" as POICategoryKey, "border-l-event-nightlife"],
    ])("renders %s category with correct left border colour", (category, expectedClass) => {
      const poi = makePOI({ category });
      const { container } = render(<POICard poi={poi} onSelect={onSelect} />);
      const card = container.querySelector("button");
      expect(card?.className).toContain(expectedClass);
    });
  });
});
