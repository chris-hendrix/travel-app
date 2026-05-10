import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventCard } from "../event-card";
import type { Event } from "@journiful/shared/types";

describe("EventCard", () => {
  const baseEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Beach Lunch",
    description: "Lunch at beachside restaurant",
    eventType: "food_and_drink",
    location: "Malibu Cafe",
    startTime: new Date("2026-07-15T12:00:00Z"),
    endTime: new Date("2026-07-15T14:00:00Z"),
    allDay: false,
    links: [{ url: "https://example.com/menu" }],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  const onClick = vi.fn();

  beforeEach(() => {
    onClick.mockClear();
  });

  describe("Rendering", () => {
    it("renders event name and time", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      expect(screen.getByText("Beach Lunch")).toBeDefined();
    });

  });

  describe("Event types", () => {
    it("applies correct color class for travel event", () => {
      const event = { ...baseEvent, eventType: "travel" as const };
      const { container } = render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = container.firstElementChild;
      expect(card?.className).toContain("border-l-event-travel");
      expect(card?.className).toContain("bg-event-travel-light");
    });

    it("applies correct color class for food_and_drink event", () => {
      const { container } = render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = container.firstElementChild;
      expect(card?.className).toContain("border-l-event-food_and_drink");
      expect(card?.className).toContain("bg-event-food_and_drink-light");
    });

    it("applies correct color class for misc event", () => {
      const event = { ...baseEvent, eventType: "misc" as const };
      const { container } = render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = container.firstElementChild;
      expect(card?.className).toContain("border-l-event-misc");
      expect(card?.className).toContain("bg-event-misc-light");
    });
  });

  describe("All-day events", () => {
    it('shows "All day" for all-day events', () => {
      const event = { ...baseEvent, allDay: true, endTime: null };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      expect(screen.getByText("All day")).toBeDefined();
    });
  });

  describe("Click behavior", () => {
    it("calls onClick when card is clicked", async () => {
      const user = userEvent.setup();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = screen.getByRole("button");
      await user.click(card);

      expect(onClick).toHaveBeenCalledWith(baseEvent);
    });

    it("calls onClick on Enter key", async () => {
      const user = userEvent.setup();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = screen.getByRole("button");
      card.focus();
      await user.keyboard("{Enter}");

      expect(onClick).toHaveBeenCalledWith(baseEvent);
    });

    it("calls onClick on Space key", async () => {
      const user = userEvent.setup();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = screen.getByRole("button");
      card.focus();
      await user.keyboard(" ");

      expect(onClick).toHaveBeenCalledWith(baseEvent);
    });
  });

  describe("Time display", () => {
    it("shows date prefix when showDate is true", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-12T18:00:00Z"),
      };
      render(
        <EventCard
          event={event}
          timezone="UTC"
          onClick={onClick}
          showDate={true}
        />,
      );

      expect(screen.getByText(/Feb 10, 2026/)).toBeDefined();
    });

    it("shows start time for same-day events", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-10T18:00:00Z"),
      };
      render(<EventCard event={event} timezone="UTC" onClick={onClick} />);

      expect(screen.getByText(/10:00 AM/)).toBeDefined();
    });
  });
});
