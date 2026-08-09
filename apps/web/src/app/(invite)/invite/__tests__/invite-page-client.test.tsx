import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InvitePageClient } from "../invite-page-client";

// ---------------------------------------------------------------------------
// Mock next/navigation — provide useSearchParams with a controllable get()
// ---------------------------------------------------------------------------
const mockSearchParamsGet = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

// ---------------------------------------------------------------------------
// Mock InvitePreviewCard — mirrors the real component's contract
// ---------------------------------------------------------------------------
vi.mock("../[id]/invite-preview-card", () => ({
  InvitePreviewCard: (props: Record<string, unknown>) => {
    if (!props.valid) {
      return (
        <div data-testid="preview-card-invalid">
          <h1>Invitation unavailable</h1>
          <p>This invitation is no longer available. It may have expired or already been used.</p>
        </div>
      );
    }
    const joinUrl = `/login?redirect=${encodeURIComponent(`/trips?id=${props.tripId}`)}&phone=${encodeURIComponent(props.inviteePhone as string)}`;
    return (
      <div data-testid="preview-card-valid">
        <h1>You&apos;re invited!</h1>
        <p data-testid="inviter-line">{props.inviterName as string} invited you to join a trip</p>
        <h2 data-testid="trip-name">{props.tripName as string}</h2>
        <span data-testid="destination">{props.destination as string}</span>
        <span data-testid="invitee-phone">{props.inviteePhone as string}</span>
        <a href={joinUrl} data-testid="join-link">Join Trip</a>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Mock @/lib/api — apiRequest (POST accept) and API_URL (for fetch prefix)
// ---------------------------------------------------------------------------
const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  apiRequest: mockApiRequest,
  API_URL: "http://localhost:8000/api",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PREVIEW = {
  success: true,
  tripName: "Summer Adventure",
  destination: "Bali, Indonesia",
  startDate: "2026-08-15",
  endDate: "2026-08-22",
  inviterName: "Alice",
  inviteePhone: "+15555001000",
  tripId: "trip-789",
} as const;

/** Make the next fetch() resolve with a given JSON body. */
function mockFetchJson(data: object) {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: () => Promise.resolve(data),
  } as Response);
}

/** Make the next fetch() never resolve (keeps component in loading state). */
function mockFetchPending() {
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InvitePageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. Renders preview card with trip details
  // ------------------------------------------------------------------
  it("renders preview card with trip details when invitation is valid", async () => {
    mockSearchParamsGet.mockReturnValue("invite-123");
    mockFetchJson(VALID_PREVIEW);
    // Auto-accept fails: simulate unauthenticated user
    mockApiRequest.mockRejectedValueOnce(new Error("Not authenticated"));

    render(<InvitePageClient />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-card-valid")).toBeDefined();
    });

    // Trip name and destination are visible
    expect(screen.getByText("Summer Adventure")).toBeDefined();
    expect(screen.getByText("Bali, Indonesia")).toBeDefined();

    // Inviter and invitee info are shown
    expect(screen.getByText(/Alice invited you to join a trip/)).toBeDefined();
    expect(screen.getByText("+15555001000")).toBeDefined();
  });

  // ------------------------------------------------------------------
  // 2. "Join Trip" link with correct redirect param
  // ------------------------------------------------------------------
  it("renders Join Trip link that redirects to login with correct params", async () => {
    mockSearchParamsGet.mockReturnValue("invite-123");
    mockFetchJson(VALID_PREVIEW);
    mockApiRequest.mockRejectedValueOnce(new Error("Not authenticated"));

    render(<InvitePageClient />);

    await waitFor(() => {
      expect(screen.getByTestId("join-link")).toBeDefined();
    });

    const link = screen.getByTestId("join-link") as HTMLAnchorElement;
    // redirect = encodeURIComponent("/trips?id=trip-789")  → "%2Ftrips%3Fid%3Dtrip-789"
    // phone   = encodeURIComponent("+15555001000")         → "%2B15555001000"
    expect(link.getAttribute("href")).toBe(
      "/login?redirect=%2Ftrips%3Fid%3Dtrip-789&phone=%2B15555001000",
    );
    expect(screen.getByText("Join Trip")).toBeDefined();
  });

  // ------------------------------------------------------------------
  // 3. Error state — invitation invalid / expired
  // ------------------------------------------------------------------
  it("shows invitation unavailable when invitation is invalid or expired", async () => {
    mockSearchParamsGet.mockReturnValue("expired-invite");
    mockFetchJson({ success: false });

    render(<InvitePageClient />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-card-invalid")).toBeDefined();
    });

    expect(screen.getByText("Invitation unavailable")).toBeDefined();
    expect(
      screen.getByText(/this invitation is no longer available/i),
    ).toBeDefined();
  });

  // ------------------------------------------------------------------
  // 3b. Error state — no invite id in URL
  // ------------------------------------------------------------------
  it("shows invitation unavailable when no invite id is present", () => {
    mockSearchParamsGet.mockReturnValue(null);

    render(<InvitePageClient />);

    // Synchronous — no fetch happens without an id
    expect(screen.getByTestId("preview-card-invalid")).toBeDefined();
    expect(screen.getByText("Invitation unavailable")).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 4. Auto-accept for authenticated user
  // ------------------------------------------------------------------
  it("auto-accepts invitation for authenticated users", async () => {
    mockSearchParamsGet.mockReturnValue("invite-auth");
    mockFetchJson({
      success: true,
      tripName: "Winter Getaway",
      destination: "Aspen, CO",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
      inviterName: "Bob",
      inviteePhone: "+15555002000",
      tripId: "trip-456",
    });
    // Simulate successful accept (user has valid auth cookie)
    mockApiRequest.mockResolvedValueOnce({ success: true, tripId: "trip-456" });

    render(<InvitePageClient />);

    // The component calls apiRequest for auto-accept after the preview fetch resolves
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/invitations/invite-auth/accept",
        { method: "POST" },
      );
    });

    // Preview card should NOT be shown (auto-accept succeeded; component
    // redirects via window.location before reaching setPreview/setLoading(false))
    expect(screen.queryByTestId("preview-card-valid")).toBeNull();
    expect(screen.queryByTestId("preview-card-invalid")).toBeNull();
  });

  // ------------------------------------------------------------------
  // 4b. Auto-accept failure → falls back to preview card
  // ------------------------------------------------------------------
  it("falls back to preview card when auto-accept fails", async () => {
    mockSearchParamsGet.mockReturnValue("invite-123");
    mockFetchJson(VALID_PREVIEW);
    // Auto-accept fails — user is unauthenticated or has wrong phone
    mockApiRequest.mockRejectedValueOnce(new Error("Unauthorized"));

    render(<InvitePageClient />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-card-valid")).toBeDefined();
    });

    // Trip details are still visible (fallback worked)
    expect(screen.getByText("Summer Adventure")).toBeDefined();
    // Auto-accept was attempted
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // 4c. Loading state while fetching invitation
  // ------------------------------------------------------------------
  it("shows loading message while invitation is being fetched", () => {
    mockSearchParamsGet.mockReturnValue("invite-123");
    mockFetchPending();

    render(<InvitePageClient />);

    expect(screen.getByText("Loading invitation...")).toBeDefined();
  });
});
