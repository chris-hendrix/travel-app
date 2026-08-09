import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventDetailSheet } from "../event-detail-sheet";
import type { Event } from "@journiful/shared/types";

// useDialogBack manipulates window.history and is unrelated to the badge
// feature under test, so we stub it as a no-op.
vi.mock("@/hooks/use-dialog-back", () => ({
  useDialogBack: () => {},
}));

describe("EventDetailSheet", () => {
  const baseEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Test Event",
    description: null,
    eventType: "misc",
    location: null,
    locationLat: null,
    locationLon: null,
    startTime: new Date("2026-07-15T12:00:00Z"),
    endTime: null,
    allDay: false,
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  const onOpenChange = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    onOpenChange.mockClear();
    onEdit.mockClear();
    onDelete.mockClear();
  });

  describe("'Member no longer attending' badge", () => {
    it("shows the badge when creatorAttending is false", () => {
      const event: Event = { ...baseEvent, creatorAttending: false };
      render(
        <EventDetailSheet
          event={event}
          open={true}
          onOpenChange={onOpenChange}
          timezone="UTC"
          canEdit={false}
          canDelete={false}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      expect(
        screen.getByText("Member no longer attending"),
      ).toBeDefined();
    });

    it("does not show the badge when creatorAttending is true", () => {
      const event: Event = { ...baseEvent, creatorAttending: true };
      render(
        <EventDetailSheet
          event={event}
          open={true}
          onOpenChange={onOpenChange}
          timezone="UTC"
          canEdit={false}
          canDelete={false}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      expect(
        screen.queryByText("Member no longer attending"),
      ).toBeNull();
    });
  });
});
