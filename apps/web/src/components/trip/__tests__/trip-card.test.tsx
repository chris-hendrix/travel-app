import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripCard } from "../trip-card";

// Mock next/image
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    fill,
    priority,
    unoptimized,
    sizes,
    ...props
  }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock usePrefetchTrip hook
const mockPrefetch = vi.fn();
vi.mock("@/hooks/use-trips", () => ({
  usePrefetchTrip: () => mockPrefetch,
}));

// Mock supportsHover to true so onMouseEnter handlers fire in tests
vi.mock("@/lib/supports-hover", () => ({
  supportsHover: true,
}));

describe("TripCard", () => {
  beforeEach(() => {
    mockPrefetch.mockClear();
  });

  const baseTrip = {
    id: "trip-123",
    name: "Summer Beach Vacation",
    destination: "Malibu, CA",
    startDate: "2026-07-15",
    endDate: "2026-07-20",
    coverImageUrl: "https://example.com/beach.jpg",
    isOrganizer: false,
    rsvpStatus: "going" as const,
    organizerInfo: [
      {
        id: "user-1",
        displayName: "John Doe",
        profilePhotoUrl: "https://example.com/john.jpg",
      },
    ],
    memberCount: 5,
    eventCount: 3,
  };

  describe("Rendering with full data", () => {
    it("renders all trip information correctly", () => {
      render(<TripCard trip={baseTrip} />);

      expect(screen.getByText("Summer Beach Vacation")).toBeDefined();
      expect(screen.getByText("Malibu, CA")).toBeDefined();
      expect(screen.getByText("Jul 15 - 20, 2026")).toBeDefined();
      expect(screen.getByText("5 travelers")).toBeDefined();
      expect(screen.getByText("3 events")).toBeDefined();
    });

    it("displays cover image when provided", () => {
      render(<TripCard trip={baseTrip} />);

      const image = screen.getByAltText(
        "Summer Beach Vacation",
      ) as HTMLImageElement;
      expect(image).toBeDefined();
      expect(image.src).toBe("https://example.com/beach.jpg");
    });

    it("displays organizer profile photos when provided", () => {
      render(<TripCard trip={baseTrip} />);

      const avatar = screen.getByAltText("John Doe") as HTMLImageElement;
      expect(avatar).toBeDefined();
      expect(avatar.src).toBe("https://example.com/john.jpg");
    });
  });

  describe("RSVP badge rendering", () => {
    it("shows Going badge with success styling for going status", () => {
      render(<TripCard trip={baseTrip} />);

      const badge = screen.getByText("Going");
      expect(badge).toBeDefined();
      expect(badge.className).toContain("bg-black/50");
      expect(badge.className).toContain("text-overlay-success");
    });

    it("shows Maybe badge with warning styling for maybe status", () => {
      const trip = { ...baseTrip, rsvpStatus: "maybe" as const };
      render(<TripCard trip={trip} />);

      const badge = screen.getByText("Maybe");
      expect(badge).toBeDefined();
      expect(badge.className).toContain("bg-black/50");
      expect(badge.className).toContain("text-overlay-warning");
    });

    it("shows Not Going badge with overlay styling for not_going status", () => {
      const trip = { ...baseTrip, rsvpStatus: "not_going" as const };
      render(<TripCard trip={trip} />);

      const badge = screen.getByText("Not Going");
      expect(badge).toBeDefined();
      expect(badge.className).toContain("text-overlay-muted");
    });

    it("does not show RSVP badge for no_response status", () => {
      const trip = { ...baseTrip, rsvpStatus: "no_response" as const };
      render(<TripCard trip={trip} />);

      expect(screen.queryByText("Going")).toBeNull();
      expect(screen.queryByText("Maybe")).toBeNull();
      expect(screen.queryByText("Not going")).toBeNull();
    });
  });

  describe("Organizing badge", () => {
    it("shows Organizing badge when isOrganizer is true", () => {
      const trip = { ...baseTrip, isOrganizer: true };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("Organizing")).toBeDefined();
    });

    it("does not show Organizing badge when isOrganizer is false", () => {
      render(<TripCard trip={baseTrip} />);

      expect(screen.queryByText("Organizing")).toBeNull();
    });
  });

  describe("Cover image handling", () => {
    it("shows gradient placeholder when coverImageUrl is null", () => {
      const trip = { ...baseTrip, coverImageUrl: null };
      const { container } = render(<TripCard trip={trip} />);

      const placeholder = container.querySelector(
        ".bg-gradient-to-br.from-primary\\/40.via-accent\\/30.to-secondary\\/40",
      );
      expect(placeholder).toBeDefined();
    });

    it("shows cover image when coverImageUrl is provided", () => {
      render(<TripCard trip={baseTrip} />);

      const image = screen.getByAltText("Summer Beach Vacation");
      expect(image).toBeDefined();
    });
  });

  describe("Date formatting", () => {
    it("shows formatted date range when both dates provided", () => {
      render(<TripCard trip={baseTrip} />);

      expect(screen.getByText("Jul 15 - 20, 2026")).toBeDefined();
    });

    it("shows different months correctly", () => {
      const trip = {
        ...baseTrip,
        startDate: "2026-07-28",
        endDate: "2026-08-05",
      };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("Jul 28 - Aug 5, 2026")).toBeDefined();
    });

    it('shows "Dates TBD" when both dates are null', () => {
      const trip = { ...baseTrip, startDate: null, endDate: null };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("Dates TBD")).toBeDefined();
    });

    it("shows start date only when end date is null", () => {
      const trip = { ...baseTrip, endDate: null };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("Starts Jul 15, 2026")).toBeDefined();
    });

    it("shows end date only when start date is null", () => {
      const trip = { ...baseTrip, startDate: null };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("Ends Jul 20, 2026")).toBeDefined();
    });
  });

  describe("Organizer avatars", () => {
    it("displays up to 3 organizer avatars", () => {
      const trip = {
        ...baseTrip,
        organizerInfo: [
          {
            id: "1",
            displayName: "John",
            profilePhotoUrl: "https://example.com/1.jpg",
          },
          {
            id: "2",
            displayName: "Jane",
            profilePhotoUrl: "https://example.com/2.jpg",
          },
          {
            id: "3",
            displayName: "Bob",
            profilePhotoUrl: "https://example.com/3.jpg",
          },
        ],
      };
      render(<TripCard trip={trip} />);

      expect(screen.getByAltText("John")).toBeDefined();
      expect(screen.getByAltText("Jane")).toBeDefined();
      expect(screen.getByAltText("Bob")).toBeDefined();
    });

    it("limits to 3 organizer avatars even when more exist", () => {
      const trip = {
        ...baseTrip,
        organizerInfo: [
          {
            id: "1",
            displayName: "John",
            profilePhotoUrl: "https://example.com/1.jpg",
          },
          {
            id: "2",
            displayName: "Jane",
            profilePhotoUrl: "https://example.com/2.jpg",
          },
          {
            id: "3",
            displayName: "Bob",
            profilePhotoUrl: "https://example.com/3.jpg",
          },
          {
            id: "4",
            displayName: "Alice",
            profilePhotoUrl: "https://example.com/4.jpg",
          },
        ],
      };
      const { container } = render(<TripCard trip={trip} />);

      const avatars = container.querySelectorAll(
        "img[alt='John'], img[alt='Jane'], img[alt='Bob']",
      );
      expect(avatars.length).toBe(3);
      expect(screen.queryByAltText("Alice")).toBeNull();
    });

    it("shows initials when organizer has no profile photo", () => {
      const trip = {
        ...baseTrip,
        organizerInfo: [
          { id: "1", displayName: "John Doe", profilePhotoUrl: null },
        ],
      };
      const { container } = render(<TripCard trip={trip} />);

      const initialsElement = container.querySelector(".bg-white\\/20");
      expect(initialsElement).toBeDefined();
      expect(initialsElement?.textContent).toBe("JD");
    });
  });

  describe("Event count display", () => {
    it('shows "No events" when eventCount is 0', () => {
      const trip = { ...baseTrip, eventCount: 0 };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("No events")).toBeDefined();
    });

    it("shows singular event text for 1 event", () => {
      const trip = { ...baseTrip, eventCount: 1 };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("1 event")).toBeDefined();
    });

    it("shows plural events text for multiple events", () => {
      render(<TripCard trip={baseTrip} />);

      expect(screen.getByText("3 events")).toBeDefined();
    });
  });

  describe("Member count display", () => {
    it("shows singular traveler text for 1 member", () => {
      const trip = { ...baseTrip, memberCount: 1 };
      render(<TripCard trip={trip} />);

      expect(screen.getByText("1 traveler")).toBeDefined();
    });

    it("shows plural travelers text for multiple members", () => {
      render(<TripCard trip={baseTrip} />);

      expect(screen.getByText("5 travelers")).toBeDefined();
    });
  });

  describe("Navigation", () => {
    it("renders as a link to trip detail page", () => {
      render(<TripCard trip={baseTrip} />);

      const link = screen.getByRole("link");
      expect(link.getAttribute("href")).toBe("/trips/trip-123");
    });

    it("has correct href for different trip ids", () => {
      const trip = { ...baseTrip, id: "trip-456" };
      render(<TripCard trip={trip} />);

      const link = screen.getByRole("link");
      expect(link.getAttribute("href")).toBe("/trips/trip-456");
    });
  });

  describe("Prefetch on hover", () => {
    it("triggers prefetch on mouse enter", async () => {
      const user = userEvent.setup();
      render(<TripCard trip={baseTrip} />);

      const link = screen.getByRole("link");
      await user.hover(link);

      expect(mockPrefetch).toHaveBeenCalled();
    });
  });

  describe("Animation delay", () => {
    it("applies animation delay based on index prop", () => {
      const { container } = render(<TripCard trip={baseTrip} index={3} />);

      const card = container.firstChild as HTMLElement;
      expect(card.style.animationDelay).toBe("240ms");
    });

    it("defaults to 0ms delay when index not provided", () => {
      const { container } = render(<TripCard trip={baseTrip} />);

      const card = container.firstChild as HTMLElement;
      expect(card.style.animationDelay).toBe("0ms");
    });
  });

  describe("Card rotation", () => {
    it("applies rotation based on index modulo 4", () => {
      const rotations = [-1.5, 0.8, -0.5, 1.2];

      for (let i = 0; i < 4; i++) {
        const { container } = render(<TripCard trip={baseTrip} index={i} />);
        const card = container.firstChild as HTMLElement;
        expect(card.style.transform).toBe(`rotate(${rotations[i]}deg)`);
      }
    });

    it("cycles rotations for indices beyond 3", () => {
      const { container } = render(<TripCard trip={baseTrip} index={4} />);

      const card = container.firstChild as HTMLElement;
      // index 4 % 4 === 0, so rotation should be -1.5
      expect(card.style.transform).toBe("rotate(-1.5deg)");
    });
  });

  describe("Postcard layout", () => {
    it("renders with postcard-card class", () => {
      const { container } = render(<TripCard trip={baseTrip} />);

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain("postcard-card");
    });

    it("renders with card-noise class for paper grain", () => {
      const { container } = render(<TripCard trip={baseTrip} />);

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain("card-noise");
    });

    it("renders with landscape aspect ratio", () => {
      const { container } = render(<TripCard trip={baseTrip} />);

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain("aspect-[3/2]");
    });

    it("renders pushpin element", () => {
      const { container } = render(<TripCard trip={baseTrip} />);

      const pushpin = container.querySelector(".pushpin");
      expect(pushpin).not.toBeNull();
    });

    it("applies motion-safe animation classes", () => {
      const { container } = render(<TripCard trip={baseTrip} />);

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain(
        "motion-safe:animate-[staggerIn_500ms_ease-out_both]",
      );
      expect(card.className).toContain("motion-safe:active:scale-[0.98]");
    });
  });

  describe("Text truncation", () => {
    it("applies truncate class to trip name", () => {
      const trip = {
        ...baseTrip,
        name: "This is a very long trip name that should be truncated when it exceeds the available space",
      };
      const { container } = render(<TripCard trip={trip} />);

      const titleElement = container.querySelector("h3");
      expect(titleElement?.className).toContain("truncate");
    });

    it("applies truncate class to destination", () => {
      const trip = {
        ...baseTrip,
        destination: "A very long destination name that should be truncated",
      };
      const { container } = render(<TripCard trip={trip} />);

      const destinationSpan = screen.getByText(trip.destination);
      expect(destinationSpan.className).toContain("truncate");
    });
  });

  describe("Styling and accessibility", () => {
    it("renders as a link element", () => {
      render(<TripCard trip={baseTrip} />);

      const link = screen.getByRole("link");
      expect(link).toBeDefined();
    });
  });
});
