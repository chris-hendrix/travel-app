import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { POICard } from "../poi-card";
import type { POISuggestion, POICategoryKey, TemperatureUnit } from "@journiful/shared/types";

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

const celsius: TemperatureUnit = "celsius";
const fahrenheit: TemperatureUnit = "fahrenheit";

describe("POICard", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
  });

  describe("rendering", () => {
    it("renders the POI name", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("Le Bistro Parisien")).toBeDefined();
    });

    it("renders the address when provided", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("123 Rue de Rivoli, Paris")).toBeDefined();
    });

    it("renders a placeholder when address is null", () => {
      const poi = makePOI({ address: null });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      // Should render an em-dash placeholder to maintain layout height
      expect(screen.getByText("\u2014")).toBeDefined();
      expect(screen.queryByText("123 Rue de Rivoli, Paris")).toBeNull();
    });

    it("renders distance in meters (< 1000m)", () => {
      const poi = makePOI({ distance: 450 });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("450 m")).toBeDefined();
    });

    it("renders distance in km (>= 1000m)", () => {
      const poi = makePOI({ distance: 1800 });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("1.8 km")).toBeDefined();
    });

    it("renders distance in feet for fahrenheit (< ~1000ft)", () => {
      const poi = makePOI({ distance: 100 }); // ~328 ft
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={fahrenheit} />);
      expect(screen.getByText("328 ft")).toBeDefined();
    });

    it("renders distance in miles for fahrenheit (>= ~1000ft)", () => {
      const poi = makePOI({ distance: 5000 }); // ~3.1 mi
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={fahrenheit} />);
      expect(screen.getByText("3.1 mi")).toBeDefined();
    });

    it("has a left border class for the correct category", () => {
      const poi = makePOI({ category: "nightlife" });
      const { container } = render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      const card = container.querySelector("button");
      expect(card?.className).toContain("border-l-event-nightlife");
    });

    it("renders subcategory when provided", () => {
      const poi = makePOI({ subcategory: "Italian Restaurant" });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("Italian Restaurant")).toBeDefined();
    });

    it("does not render subcategory when null", () => {
      const poi = makePOI({ subcategory: null });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.queryByText("Italian Restaurant")).toBeNull();
    });

    it("has a left border class for the correct category", () => {
      const poi = makePOI({ category: "food_and_drink" });
      const { container } = render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      const card = container.querySelector("button");
      expect(card?.className).toContain("border-l-event-food_and_drink");
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
      const { container } = render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      const card = container.querySelector("button");
      expect(card?.className).toContain(expectedClass);
    });
  });

  describe("interaction", () => {
    it("calls onSelect when clicked", async () => {
      const user = userEvent.setup();
      const poi = makePOI({ sourceId: "fsq-click-test" });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);

      const card = screen.getByRole("button");
      await user.click(card);

      expect(onSelect).toHaveBeenCalledWith(poi);
    });

    it("is a button element for accessibility", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} temperatureUnit={celsius} />);
      const button = screen.getByRole("button");
      expect(button.tagName).toBe("BUTTON");
    });
  });
});
