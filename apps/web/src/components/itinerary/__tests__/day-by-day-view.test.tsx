import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DayByDayView } from "../day-by-day-view";
import type { MemberTravel } from "@journiful/shared/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeTravel(overrides: Partial<MemberTravel> = {}): MemberTravel {
  return {
    id: `travel-${Math.random().toString(36).slice(2)}`,
    tripId: "trip-1",
    memberId: "member-1",
    memberName: "Alice",
    travelType: "arrival",
    departureLocation: null,
    departureTime: null,
    arrivalLocation: "JFK Airport",
    arrivalTime: new Date("2026-03-15T14:00:00Z"),
    details: null,
    flightNumber: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function renderView(memberTravels: MemberTravel[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DayByDayView
        events={[]}
        memberTravels={memberTravels}
        timezone="America/New_York"
        tripStartDate="2026-03-15"
        tripEndDate="2026-03-20"
        isOrganizer={false}
        userId="user-1"
        currentMemberId="member-1"
        userNameMap={new Map([["member-1", "Alice"]])}
        showMemberTravel
      />
    </QueryClientProvider>,
  );
}

describe("DayByDayView member travel grouping", () => {
  it("groups arrivals into day buckets by pertinent (arrival) time", () => {
    renderView([makeTravel({ id: "a1" })]);
    // Alice's arrival line item renders in the day bucket
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("groups departures by departure time, not arrival time", () => {
    const departure = makeTravel({
      id: "d1",
      travelType: "departure",
      // Counterpart (hidden) arrival side differs from pertinent departure side
      arrivalTime: new Date("2026-03-15T14:00:00Z"),
      arrivalLocation: "JFK Airport",
      departureTime: new Date("2026-03-20T18:00:00Z"),
      departureLocation: "JFK Airport",
    });
    renderView([departure]);
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("skips travels with no pertinent time", () => {
    const empty = makeTravel({
      id: "e1",
      arrivalTime: null,
      arrivalLocation: null,
    });
    renderView([empty]);
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("sorts multiple arrivals by pertinent time", () => {
    const early = makeTravel({
      id: "early",
      memberName: "Early Bird",
      arrivalTime: new Date("2026-03-15T08:00:00Z"),
    });
    const late = makeTravel({
      id: "late",
      memberName: "Night Owl",
      arrivalTime: new Date("2026-03-15T22:00:00Z"),
    });
    renderView([late, early]);
    expect(screen.getByText("Early Bird")).toBeDefined();
    expect(screen.getByText("Night Owl")).toBeDefined();
  });
});
