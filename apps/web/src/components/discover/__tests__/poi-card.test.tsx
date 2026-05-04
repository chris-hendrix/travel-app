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

    it("does not render an address line when address is null", () => {
      const poi = makePOI({ address: null });
      render(<POICard poi={poi} onSelect={onSelect} />);
      // Should not find the address text
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

    it("applies correct category colour class to badge", () => {
      const poi = makePOI({ category: "food_and_drink" });
      const { container } = render(<POICard poi={poi} onSelect={onSelect} />);
      const badge = container.querySelector("span");
      expect(badge?.className).toContain("bg-event-food_and_drink-light");
      expect(badge?.className).toContain("text-event-food_and_drink");
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
      ["food_and_drink" as POICategoryKey, "bg-event-food_and_drink-light", "Food & Drink"],
      ["arts_and_entertainment" as POICategoryKey, "bg-event-arts_and_entertainment-light", "Arts"],
      ["outdoors" as POICategoryKey, "bg-event-outdoors-light", "Outdoors"],
      ["nightlife" as POICategoryKey, "bg-event-nightlife-light", "Nightlife"],
    ])("renders %s category with correct badge colour and label", (category, expectedClass, label) => {
      const poi = makePOI({ category });
      const { container } = render(<POICard poi={poi} onSelect={onSelect} />);
      const badge = container.querySelector("span");
      expect(badge?.textContent).toBe(label);
      expect(badge?.className).toContain(expectedClass);
    });
  });
});
