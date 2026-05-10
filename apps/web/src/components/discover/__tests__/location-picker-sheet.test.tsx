import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPickerSheet } from "../location-picker-sheet";

describe("LocationPickerSheet", () => {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();

  const tripDest = { lat: 32.79, lon: -96.81, name: "Dallas, TX" };
  const accommodations = [
    {
      id: "acc-1",
      name: "Marriott Downtown",
      address: "123 Main St",
      addressLat: 32.78,
      addressLon: -96.80,
    },
    {
      id: "acc-2",
      name: "Airbnb Uptown",
      address: "456 Elm St",
      addressLat: 32.80,
      addressLon: -96.82,
    },
    {
      id: "acc-no-coords",
      name: "No Coords Hotel",
      address: null,
      addressLat: null,
      addressLon: null,
    },
  ];

  beforeEach(() => {
    onSelect.mockClear();
    onOpenChange.mockClear();
  });

  describe("rendering", () => {
    it("renders trip destination when provided", () => {
      render(
        <LocationPickerSheet
          open={true}
          onOpenChange={onOpenChange}
          tripDestination={tripDest}
          accommodations={[]}
          selectedLocation={{ lat: 32.79, lon: -96.81, name: "Dallas, TX" }}
          onSelect={onSelect}
        />,
      );
      expect(screen.getByText("Dallas, TX")).toBeDefined();
    });

    it("does not render trip destination when null", () => {
      render(
        <LocationPickerSheet
          open={true}
          onOpenChange={onOpenChange}
          tripDestination={null}
          accommodations={[]}
          selectedLocation={{ lat: 32.79, lon: -96.81, name: "Somewhere" }}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByText("Trip destination")).toBeNull();
    });

    it("renders accommodations with coords", () => {
      render(
        <LocationPickerSheet
          open={true}
          onOpenChange={onOpenChange}
          tripDestination={tripDest}
          accommodations={accommodations}
          selectedLocation={{ lat: 32.79, lon: -96.81, name: "Dallas, TX" }}
          onSelect={onSelect}
        />,
      );
      expect(screen.getByText("Marriott Downtown")).toBeDefined();
      expect(screen.getByText("Airbnb Uptown")).toBeDefined();
    });

    it("filters out accommodations without coords (lat/lon are 0)", () => {
      render(
        <LocationPickerSheet
          open={true}
          onOpenChange={onOpenChange}
          tripDestination={tripDest}
          accommodations={accommodations}
          selectedLocation={{ lat: 32.79, lon: -96.81, name: "Dallas, TX" }}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByText("No Coords Hotel")).toBeNull();
    });
  });

  describe("selection", () => {
    it("highlights the selected location with a check icon", () => {
      render(
        <LocationPickerSheet
          open={true}
          onOpenChange={onOpenChange}
          tripDestination={tripDest}
          accommodations={[]}
          selectedLocation={{ lat: 32.79, lon: -96.81, name: "Dallas, TX" }}
          onSelect={onSelect}
        />,
      );
      // The selected row should have a check icon
      const checkIcons = document.querySelectorAll("svg.lucide-check");
      // At least one check icon for the selected row
      expect(checkIcons.length).toBeGreaterThan(0);
    });

    it("calls onSelect with location when a row is clicked", async () => {
      const user = userEvent.setup();
      render(
        <LocationPickerSheet
          open={true}
          onOpenChange={onOpenChange}
          tripDestination={tripDest}
          accommodations={accommodations}
          selectedLocation={{ lat: 32.79, lon: -96.81, name: "Dallas, TX" }}
          onSelect={onSelect}
        />,
      );
      const accRow = screen.getByText("Marriott Downtown").closest("button")!;
      await user.click(accRow);
      expect(onSelect).toHaveBeenCalledWith({
        lat: 32.78,
        lon: -96.80,
        name: "Marriott Downtown",
      });
    });
  });
});
