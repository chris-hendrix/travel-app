import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventCard } from "../event-card";
import type { Event } from "@tripful/shared/types";

describe("EventCard", () => {
  const baseEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Beach Lunch",
    description: "Lunch at beachside restaurant",
    eventType: "meal",
    location: "Malibu Cafe",
    meetupLocation: null,
    meetupTime: null,
    startTime: new Date("2026-07-15T12:00:00Z"),
    endTime: new Date("2026-07-15T14:00:00Z"),
    allDay: false,
    isOptional: false,
    links: ["https://example.com/menu"],
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

    it("renders location when provided", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      expect(screen.getByText("Malibu Cafe")).toBeDefined();
    });

    it("shows Optional badge when isOptional is true", () => {
      const event = { ...baseEvent, isOptional: true };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      expect(screen.getByText("Optional")).toBeDefined();
    });

    it("does not show Optional badge when isOptional is false", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      expect(screen.queryByText("Optional")).toBeNull();
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

    it("applies correct color class for meal event", () => {
      const { container } = render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = container.firstElementChild;
      expect(card?.className).toContain("border-l-event-meal");
      expect(card?.className).toContain("bg-event-meal-light");
    });

    it("applies correct color class for activity event", () => {
      const event = { ...baseEvent, eventType: "activity" as const };
      const { container } = render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          onClick={onClick}
        />,
      );

      const card = container.firstElementChild;
      expect(card?.className).toContain("border-l-event-activity");
      expect(card?.className).toContain("bg-event-activity-light");
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

  describe("Multi-day time display", () => {
    it("shows date with time for multi-day events", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-12T18:00:00Z"),
      };
      render(<EventCard event={event} timezone="UTC" onClick={onClick} />);

      // Should show month in the time display for multi-day events
      expect(screen.getByText(/Feb 10/)).toBeDefined();
      expect(screen.getByText(/Feb 12/)).toBeDefined();
    });

    it("treats midnight end time as same-day event", () => {
      const event = {
        ...baseEvent,
        // 8 PM to midnight — should be treated as single-day, not multi-day
        startTime: new Date("2026-02-10T20:00:00Z"),
        endTime: new Date("2026-02-11T00:00:00Z"),
      };
      render(<EventCard event={event} timezone="UTC" onClick={onClick} />);

      // Should show normal time range, not multi-day format
      expect(screen.getByText(/8:00 PM - 12:00 AM/)).toBeDefined();
    });

    it("shows normal time range for same-day events", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-10T18:00:00Z"),
      };
      render(<EventCard event={event} timezone="UTC" onClick={onClick} />);

      // Should not include month in single-day time display
      expect(screen.getByText(/10:00 AM - 6:00 PM/)).toBeDefined();
    });
  });
});
