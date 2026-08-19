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
    website: null,
    tel: null,
    subcategory: null,
    eventId: null,
    photoName: null,
    photoAttribution: null,
    googleMapsUri: null,
    businessStatus: null,
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
  });

  describe("photo background", () => {
    it("renders background-image when photoName is present", () => {
      const poi = makePOI({ photoName: "places/x/photos/y" });
      const { container } = render(
        <POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />,
      );
      const bgDiv = container.querySelector('[style*="background-image"]');
      expect(bgDiv).toBeTruthy();
      const style = bgDiv!.getAttribute("style") ?? "";
      expect(style).toContain("/locations/photos/");
      expect(style).not.toContain("/api/api");
      expect(style).toContain("maxWidthPx=400");
      expect(style).toContain("maxHeightPx=280");
    });

    it("does not render background-image when photoName is null", () => {
      const poi = makePOI({ photoName: null });
      const { container } = render(
        <POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />,
      );
      expect(container.querySelector('[style*="background-image"]')).toBeNull();
    });

    it("has postcard frame and bg-card mat as fallback when no photo", () => {
      const poi = makePOI({ photoName: null });
      const { container } = render(
        <POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />,
      );
      const button = container.querySelector("button");
      expect(button?.className).toContain("postcard");
      const mat = container.querySelector(".postcard-mat");
      expect(mat?.className).toContain("bg-card");
    });
  });

  describe("photo attribution", () => {
    it("renders attribution name when photoAttribution is present", () => {
      const poi = makePOI({ photoAttribution: "Jane Doe" });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });

    it("does not render attribution text when photoAttribution is null", () => {
      const poi = makePOI({ photoAttribution: null });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.queryByText("Jane Doe")).toBeNull();
    });
  });

  describe("business status badge", () => {
    it("renders badge when businessStatus is CLOSED_TEMPORARILY", () => {
      const poi = makePOI({ businessStatus: "CLOSED_TEMPORARILY" });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.getByText("CLOSED_TEMPORARILY")).toBeDefined();
    });

    it("does not render badge when businessStatus is OPERATIONAL", () => {
      const poi = makePOI({ businessStatus: "OPERATIONAL" });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.queryByText("OPERATIONAL")).toBeNull();
    });

    it("does not render badge when businessStatus is null", () => {
      const poi = makePOI({ businessStatus: null });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      expect(screen.queryByText("CLOSED_TEMPORARILY")).toBeNull();
    });
  });

  describe("aria-label", () => {
    it("contains the POI name", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} temperatureUnit={celsius} />);
      const button = screen.getByRole("button");
      expect(button.getAttribute("aria-label")).toContain("Le Bistro Parisien");
    });

    it("does not include photo attribution hint when null", () => {
      render(<POICard poi={makePOI()} onSelect={onSelect} temperatureUnit={celsius} />);
      const button = screen.getByRole("button");
      expect(button.getAttribute("aria-label")).toBe("Le Bistro Parisien");
      expect(button.getAttribute("aria-label")).not.toContain("Photo by");
    });

    it("includes photo attribution when present", () => {
      const poi = makePOI({ photoAttribution: "Jane Doe" });
      render(<POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />);
      const button = screen.getByRole("button");
      expect(button.getAttribute("aria-label")).toBe(
        "Le Bistro Parisien \u2014 Photo by Jane Doe",
      );
    });
  });

  describe("category colour mapping", () => {
    it.each([
      ["food_and_drink" as POICategoryKey, "bg-event-food_and_drink"],
      ["arts_and_entertainment" as POICategoryKey, "bg-event-arts_and_entertainment"],
      ["outdoors" as POICategoryKey, "bg-event-outdoors"],
      ["nightlife" as POICategoryKey, "bg-event-nightlife"],
      ["wellness" as POICategoryKey, "bg-event-wellness"],
      ["shopping" as POICategoryKey, "bg-event-shopping"],
      ["lodging" as POICategoryKey, "bg-event-lodging"],
    ])("renders %s category with correct accent colour", (category, expectedClass) => {
      const poi = makePOI({ category });
      const { container } = render(
        <POICard poi={poi} onSelect={onSelect} temperatureUnit={celsius} />,
      );
      // The accent class is on the top strip div inside the photo well
      const accentStrip = container.querySelector(`.${expectedClass}`);
      expect(accentStrip).toBeTruthy();
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
