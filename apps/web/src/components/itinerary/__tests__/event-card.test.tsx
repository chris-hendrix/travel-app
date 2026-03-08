import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  describe("Rendering", () => {
    it("renders event name and time", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.getByText("Beach Lunch")).toBeDefined();
    });

    it("renders location when provided", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
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
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.getByText("Optional")).toBeDefined();
    });

    it("does not show Optional badge when isOptional is false", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.queryByText("Optional")).toBeNull();
    });
  });

  describe("Event types", () => {
    it("shows correct icon and color for travel event", () => {
      const event = { ...baseEvent, eventType: "travel" as const };
      const { container } = render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      const iconContainer = container.querySelector(".text-event-travel");
      expect(iconContainer).not.toBeNull();
    });

    it("shows correct icon and color for meal event", () => {
      const { container } = render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      const iconContainer = container.querySelector(".text-event-meal");
      expect(iconContainer).not.toBeNull();
    });

    it("shows correct icon and color for activity event", () => {
      const event = { ...baseEvent, eventType: "activity" as const };
      const { container } = render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      const iconContainer = container.querySelector(".text-event-activity");
      expect(iconContainer).not.toBeNull();
    });
  });

  describe("All-day events", () => {
    it('shows "All day" for all-day events', () => {
      const event = { ...baseEvent, allDay: true, endTime: null };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.getByText("All day")).toBeDefined();
    });
  });

  describe("Expandable behavior", () => {
    it("shows description when expanded", async () => {
      const user = userEvent.setup();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      // Click to expand
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      expect(screen.getByText("Lunch at beachside restaurant")).toBeDefined();
    });

    it("shows links when expanded", async () => {
      const user = userEvent.setup();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      // Click to expand
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      const link = screen.getByText("Link 1");
      expect(link).toBeDefined();
      expect(link.closest("a")?.href).toBe("https://example.com/menu");
    });
  });

  describe("Edit and delete buttons", () => {
    it("shows edit button when canEdit is true", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={true}
          canDelete={false}
          onEdit={onEdit}
        />,
      );

      // Expand card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeDefined();
      });
    });

    it("shows delete button when canDelete is true", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={true}
          onDelete={onDelete}
        />,
      );

      // Expand card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      await waitFor(() => {
        expect(screen.getByText("Delete")).toBeDefined();
      });
    });

    it("calls onEdit when edit button is clicked", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={true}
          canDelete={false}
          onEdit={onEdit}
        />,
      );

      // Expand card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      const editButton = screen.getByText("Edit");
      await user.click(editButton);

      expect(onEdit).toHaveBeenCalled();
    });

    it("calls onDelete when delete button is clicked", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={true}
          onDelete={onDelete}
        />,
      );

      // Expand card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      const deleteButton = screen.getByText("Delete");
      await user.click(deleteButton);

      expect(onDelete).toHaveBeenCalled();
    });
  });

  describe("Creator attending indicator", () => {
    it("shows indicator when creatorAttending is false", () => {
      const event = { ...baseEvent, creatorAttending: false };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.getByText("Member no longer attending")).toBeDefined();
    });

    it("does not show indicator when creatorAttending is true", () => {
      const event = { ...baseEvent, creatorAttending: true };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.queryByText("Member no longer attending")).toBeNull();
    });

    it("does not show indicator when creatorAttending is undefined", () => {
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.queryByText("Member no longer attending")).toBeNull();
    });

    it("shows dimmed creator name when creatorAttending is false", async () => {
      const user = userEvent.setup();
      const event = { ...baseEvent, creatorAttending: false };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
          createdByName="Alice"
        />,
      );

      // Click to expand
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      const creatorElement = screen.getByText("Created by Alice");
      expect(creatorElement.className).toContain("opacity-50");
      expect(creatorElement.className).toContain("line-through");
    });

    it("does not dim creator name when creatorAttending is true", async () => {
      const user = userEvent.setup();
      const event = { ...baseEvent, creatorAttending: true };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
          createdByName="Alice"
        />,
      );

      // Click to expand
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      const creatorElement = screen.getByText("Created by Alice");
      expect(creatorElement.className).not.toContain("opacity-50");
    });

    it("uses warning badge styling", () => {
      const event = { ...baseEvent, creatorAttending: false };
      render(
        <EventCard
          event={event}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      const badgeText = screen.getByText("Member no longer attending");
      const badge = badgeText.closest('[data-slot="badge"]');
      expect(badge).not.toBeNull();
      expect(badge?.className).toContain("bg-warning/15");
      expect(badge?.className).toContain("text-warning");
      expect(badge?.className).toContain("border-warning/30");
    });
  });

  describe("Multi-day badge", () => {
    it("shows multi-day badge when endTime is on a different day than startTime", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-12T18:00:00Z"),
      };
      render(
        <EventCard
          event={event}
          timezone="UTC"
          canEdit={false}
          canDelete={false}
        />,
      );

      expect(screen.getByText(/Feb 10/)).toBeDefined();
      expect(screen.getByText(/Feb 12/)).toBeDefined();
    });

    it("does not show multi-day badge when endTime is on the same day as startTime", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-10T18:00:00Z"),
      };
      render(
        <EventCard
          event={event}
          timezone="UTC"
          canEdit={false}
          canDelete={false}
        />,
      );

      // There should be no badge with a date range containing an en-dash
      const badges = document.querySelectorAll('[data-slot="badge"]');
      const multiDayBadge = Array.from(badges).find((badge) =>
        badge.textContent?.includes("\u2013"),
      );
      expect(multiDayBadge).toBeUndefined();
    });

    it("does not show multi-day badge when endTime is null", () => {
      const event = {
        ...baseEvent,
        endTime: null,
      };
      render(
        <EventCard
          event={event}
          timezone="UTC"
          canEdit={false}
          canDelete={false}
        />,
      );

      const badges = document.querySelectorAll('[data-slot="badge"]');
      const multiDayBadge = Array.from(badges).find((badge) =>
        badge.textContent?.includes("\u2013"),
      );
      expect(multiDayBadge).toBeUndefined();
    });

    it("shows correct date range format in the badge", () => {
      const event = {
        ...baseEvent,
        startTime: new Date("2026-02-10T10:00:00Z"),
        endTime: new Date("2026-02-12T18:00:00Z"),
      };
      render(
        <EventCard
          event={event}
          timezone="UTC"
          canEdit={false}
          canDelete={false}
        />,
      );

      const badges = document.querySelectorAll('[data-slot="badge"]');
      const multiDayBadge = Array.from(badges).find((badge) =>
        badge.textContent?.includes("\u2013"),
      );
      expect(multiDayBadge).not.toBeUndefined();
      expect(multiDayBadge?.textContent).toBe("Feb 10\u2013Feb 12");
    });
  });

  describe("Meetup info display", () => {
    it("should display meetup info when meetup fields are present", async () => {
      const user = userEvent.setup();
      const eventWithMeetup = {
        ...baseEvent,
        meetupLocation: "Hotel lobby",
        meetupTime: new Date("2026-06-15T18:30:00Z"),
      };
      render(
        <EventCard
          event={eventWithMeetup}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      // Expand the card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      await waitFor(() => {
        const meetupText = screen.getByText(/Meet at Hotel lobby/);
        expect(meetupText).toBeDefined();
      });
    });

    it("should not display meetup info when meetup fields are null", async () => {
      const user = userEvent.setup();
      render(
        <EventCard
          event={baseEvent}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      // Expand the card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      await waitFor(() => {
        expect(screen.queryByText(/^Meet/)).toBeNull();
      });
    });

    it("should display only meetup location when meetupTime is null", async () => {
      const user = userEvent.setup();
      const eventWithLocation = {
        ...baseEvent,
        meetupLocation: "Hotel lobby",
        meetupTime: null,
      };
      render(
        <EventCard
          event={eventWithLocation}
          timezone="America/Los_Angeles"
          canEdit={false}
          canDelete={false}
        />,
      );

      // Expand the card
      const card = screen.getByText("Beach Lunch").closest("div");
      if (card) await user.click(card);

      await waitFor(() => {
        const meetupText = screen.getByText(/Meet at Hotel lobby/);
        expect(meetupText).toBeDefined();
      });
    });
  });
});
