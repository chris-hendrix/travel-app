import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock TripsPageContainer
vi.mock("./trips-page-container", () => ({
  TripsPageContainer: () => <div data-testid="trips-page-container" />,
}));

// Import AFTER mocks
import TripsPage, { metadata } from "./page";

describe("TripsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TripsPageContainer wrapped in Suspense", () => {
    render(<TripsPage />);
    expect(screen.getByTestId("trips-page-container")).toBeDefined();
  });

  it("exports metadata with correct title and robots", () => {
    expect(metadata).toEqual({
      title: "My Trips",
      robots: { index: false, follow: false },
    });
  });
});
