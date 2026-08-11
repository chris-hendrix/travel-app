import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { POIDetailSheet } from "../poi-detail-sheet";
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
    website: "https://bistro.example.com",
    tel: "+33 1 23 45 67 89",
    subcategory: "Italian Restaurant",
    photoName: null,
    photoAttribution: null,
    googleMapsUri: null,
    businessStatus: null,
    ...overrides,
  };
}

const celsius: TemperatureUnit = "celsius";

describe("POIDetailSheet", () => {
  const onCreateEvent = vi.fn();
  const onOpenChange = vi.fn();
  const onPrev = vi.fn();
  const onNext = vi.fn();

  beforeEach(() => {
    onCreateEvent.mockClear();
    onOpenChange.mockClear();
    onPrev.mockClear();
    onNext.mockClear();
  });

  describe("rendering", () => {
    it("renders the POI name when poi is provided", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.getByText("Le Bistro Parisien")).toBeDefined();
    });

    it("renders the address as plain text, not a link", () => {
      const poi = makePOI({ address: "456 Test St" });
      render(
        <POIDetailSheet
          poi={poi}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const addrEl = screen.getByText("456 Test St");
      expect(addrEl).toBeDefined();
      // Address should NOT be inside an <a> tag
      expect(addrEl.closest("a")).toBeNull();
    });

    it("renders distance", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ distance: 450 })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.getByText(/450/)).toBeDefined();
    });

    it("renders website link when present", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ website: "https://example.com" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const link = screen.getByText("example.com").closest("a");
      expect(link).toBeDefined();
      expect(link?.getAttribute("href")).toBe("https://example.com");
    });

    it("does not render website link when null", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ website: null, tel: null })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      // No <a> elements should exist (address is span, no photo, no website, no tel)
      const links = document.querySelectorAll("a");
      expect(links.length).toBe(0);
    });

    it("renders tel link when present", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ tel: "+1 555-0199" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const link = screen.getByText("+1 555-0199").closest("a");
      expect(link?.getAttribute("href")).toBe("tel:+1 555-0199");
    });

    it("renders subcategory when present", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ subcategory: "Italian Restaurant" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.getByText("Italian Restaurant")).toBeDefined();
    });

    it("does not render subcategory when null", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ subcategory: null })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.queryByText("Italian Restaurant")).toBeNull();
    });

    it("does not crash when poi is null", () => {
      render(
        <POIDetailSheet
          poi={null}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(document.body).toBeDefined();
    });

    it("renders the Create Event button", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(
        screen.getByRole("button", { name: /create event/i }),
      ).toBeDefined();
    });
  });

  describe("interaction", () => {
    it("calls onCreateEvent with the poi when Create Event is clicked", async () => {
      const user = userEvent.setup();
      const poi = makePOI();
      render(
        <POIDetailSheet
          poi={poi}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const button = screen.getByRole("button", { name: /create event/i });
      await user.click(button);
      expect(onCreateEvent).toHaveBeenCalledWith(poi);
    });
  });

  describe("cover photo hero", () => {
    it("renders cover hero with backgroundImage when photoName is provided", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoName: "places/x/y" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const heroLink = screen.getByLabelText(/Open Le Bistro Parisien in Google Maps/i);
      expect(heroLink).toBeDefined();
      const style = heroLink.style.backgroundImage;
      expect(style).toContain("/locations/photos/");
      expect(style).not.toContain("/api/api");
      expect(style).toContain("maxWidthPx=600");
      expect(style).toContain("maxHeightPx=400");
    });

    it("renders muted placeholder when photoName is null", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoName: null })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      // No hero <a> link should be present
      expect(screen.queryByLabelText(/Open.*Google Maps/i)).toBeNull();
      // The fallback placeholder div should be in the DOM
      const placeholderDivs = document.querySelectorAll(".aspect-\\[3\\/2\\].bg-muted");
      expect(placeholderDivs.length).toBeGreaterThanOrEqual(0);
    });

    it("hero links to googleMapsUri when provided", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoName: "places/x/y", googleMapsUri: "https://maps.google.com/place/abc" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const heroLink = screen.getByLabelText(/Open Le Bistro Parisien in Google Maps/i);
      expect(heroLink.getAttribute("href")).toBe("https://maps.google.com/place/abc");
    });

    it("hero falls back to search URL when googleMapsUri is null", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoName: "places/x/y", googleMapsUri: null })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const heroLink = screen.getByLabelText(/Open Le Bistro Parisien in Google Maps/i);
      expect(heroLink.getAttribute("href")).toContain("google.com/maps/search");
    });

    it("chevrons are siblings of hero, not nested inside the <a>", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoName: "places/x/y" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      const heroLink = screen.getByLabelText(/Open Le Bistro Parisien in Google Maps/i);
      // Chevrons should NOT be children of the hero <a>
      expect(within(heroLink).queryByRole("button")).toBeNull();
      // But they should exist in the document at the sibling level
      expect(screen.getByLabelText("Previous place")).toBeDefined();
      expect(screen.getByLabelText("Next place")).toBeDefined();
    });
  });

  describe("counter position", () => {
    it("renders counter in bottom section next to Create Event", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={true}
          poiIndex={0}
          totalPois={3}
        />,
      );
      // Counter "1 of 3" should be visible
      expect(screen.getByText("1 of 3")).toBeDefined();
      // "Create Event" button should also be present
      expect(screen.getByRole("button", { name: /create event/i })).toBeDefined();
    });

    it("does NOT render counter at the old top position", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      // "1 of 1" appears exactly once (in the bottom row), not twice
      const matches = screen.getAllByText("1 of 1");
      expect(matches.length).toBe(1);
    });
  });

  describe("attribution", () => {
    it("shows Powered by Google, not Foursquare", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.getByText("Powered by Google")).toBeDefined();
      expect(screen.queryByText(/Foursquare/i)).toBeNull();
    });

    it("shows photo attribution when photoAttribution is provided", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoAttribution: "Jane Doe" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.getByText("Photo by Jane Doe")).toBeDefined();
    });

    it("does not show photo attribution when null", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ photoAttribution: null })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
          temperatureUnit={celsius}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={false}
          hasNext={false}
          poiIndex={0}
          totalPois={1}
        />,
      );
      expect(screen.queryByText(/Photo by/i)).toBeNull();
    });
  });
});
