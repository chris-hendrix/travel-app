import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { POIDetailSheet } from "../poi-detail-sheet";
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
    website: "https://bistro.example.com",
    tel: "+33 1 23 45 67 89",
    subcategory: "Italian Restaurant",
    ...overrides,
  };
}

describe("POIDetailSheet", () => {
  const onCreateEvent = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    onCreateEvent.mockClear();
    onOpenChange.mockClear();
  });

  describe("rendering", () => {
    it("renders the POI name when poi is provided", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
        />,
      );
      expect(screen.getByText("Le Bistro Parisien")).toBeDefined();
    });

    it("renders the address with a Google Maps link", () => {
      const poi = makePOI({ address: "456 Test St" });
      render(
        <POIDetailSheet
          poi={poi}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
        />,
      );
      const link = screen.getByText("456 Test St").closest("a");
      expect(link).toBeDefined();
      expect(link?.getAttribute("href")).toContain("google.com/maps");
    });

    it("renders distance", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ distance: 450 })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
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
        />,
      );
      const link = screen.getByText("https://example.com").closest("a");
      expect(link).toBeDefined();
      expect(link?.getAttribute("href")).toBe("https://example.com");
    });

    it("does not render website section when null", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ website: null })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
        />,
      );
      // No ExternalLink icon should be present since website is null
      const links = document.querySelectorAll("a");
      // Only the GMaps link should exist
      expect([...links].every((l) => l.href.includes("google.com/maps"))).toBe(
        true,
      );
    });

    it("renders tel link when present", () => {
      render(
        <POIDetailSheet
          poi={makePOI({ tel: "+1 555-0199" })}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
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
        />,
      );
      // Should render without error
      expect(document.body).toBeDefined();
    });

    it("renders the Create Event button", () => {
      render(
        <POIDetailSheet
          poi={makePOI()}
          open={true}
          onOpenChange={onOpenChange}
          onCreateEvent={onCreateEvent}
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
        />,
      );
      const button = screen.getByRole("button", { name: /create event/i });
      await user.click(button);
      expect(onCreateEvent).toHaveBeenCalledWith(poi);
    });
  });
});
