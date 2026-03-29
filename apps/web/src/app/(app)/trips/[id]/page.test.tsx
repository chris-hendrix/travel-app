import { describe, it, expect, vi } from "vitest";

// Mock next/navigation
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

import TripDetailPage from "./page";

describe("TripDetailPage (RSC)", () => {
  it("redirects to /trips/[id]/itinerary", async () => {
    await TripDetailPage({ params: Promise.resolve({ id: "trip-123" }) });
    expect(mockRedirect).toHaveBeenCalledWith("/trips/trip-123/itinerary");
  });
});
