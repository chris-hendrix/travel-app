import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import { MutualProfileSheet } from "../mutual-profile-sheet";
import type { Mutual } from "@journiful/shared/types";

const mockMutual: Mutual = {
  id: "user-1",
  displayName: "Jane Smith",
  profilePhotoUrl: "/uploads/jane.jpg",
  sharedTripCount: 3,
  sharedTrips: [
    { id: "trip-1", name: "Summer in Italy" },
    { id: "trip-2", name: "Tokyo Adventure" },
    { id: "trip-3", name: "Mountain Retreat" },
  ],
};

const mockMutualSingleTrip: Mutual = {
  id: "user-2",
  displayName: "Bob",
  profilePhotoUrl: null,
  sharedTripCount: 1,
  sharedTrips: [{ id: "trip-1", name: "Summer in Italy" }],
};

describe("MutualProfileSheet", () => {
  it("renders mutual display name when open", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutual}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Jane Smith")).toBeDefined();
  });

  it("renders large avatar with initials", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutual}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    // In jsdom, images don't load so fallback is always shown
    expect(screen.getByText("JS")).toBeDefined();

    // Avatar should have the large size class
    const avatar = document.querySelector('[data-slot="avatar"]');
    expect(avatar).toBeTruthy();
    expect(avatar?.className).toContain("size-20");
  });

  it("renders avatar fallback initials when no photo", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutualSingleTrip}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("B")).toBeDefined();
  });

  it("renders shared trip count text with plural", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutual}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("3 shared trips")).toBeDefined();
  });

  it("renders shared trip count text with singular", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutualSingleTrip}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("1 shared trip")).toBeDefined();
  });

  it("renders shared trip links with correct hrefs", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutual}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    const italyLink = screen.getByText("Summer in Italy").closest("a");
    expect(italyLink?.getAttribute("href")).toBe("/trips/trip-1");

    const tokyoLink = screen.getByText("Tokyo Adventure").closest("a");
    expect(tokyoLink?.getAttribute("href")).toBe("/trips/trip-2");

    const mountainLink = screen.getByText("Mountain Retreat").closest("a");
    expect(mountainLink?.getAttribute("href")).toBe("/trips/trip-3");
  });

  it("does not render content when mutual is null", () => {
    render(
      <MutualProfileSheet mutual={null} open={true} onOpenChange={() => {}} />,
    );

    expect(screen.queryByText("Shared Trips")).toBeNull();
  });

  it("does not render content when closed", () => {
    render(
      <MutualProfileSheet
        mutual={mockMutual}
        open={false}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.queryByText("Jane Smith")).toBeNull();
  });
});
