import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RsvpBadgeDropdown } from "../rsvp-badge-dropdown";

// Mock sonner
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock useUpdateRsvp hook
const mockUpdateRsvp = vi.fn();
vi.mock("@/hooks/use-invitations", () => ({
  useUpdateRsvp: () => ({
    mutate: mockUpdateRsvp,
    isPending: false,
  }),
  getUpdateRsvpErrorMessage: (error: Error | null) =>
    error?.message ?? "RSVP failed",
}));

describe("RsvpBadgeDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders current status label", () => {
    render(<RsvpBadgeDropdown tripId="trip-1" status="going" />);
    expect(screen.getByText("Going")).toBeDefined();
  });

  it("renders Maybe status label", () => {
    render(<RsvpBadgeDropdown tripId="trip-1" status="maybe" />);
    expect(screen.getByText("Maybe")).toBeDefined();
  });

  it("renders Not Going status label", () => {
    render(<RsvpBadgeDropdown tripId="trip-1" status="not_going" />);
    expect(screen.getByText("Not Going")).toBeDefined();
  });

  it("renders No Response status label", () => {
    render(<RsvpBadgeDropdown tripId="trip-1" status="no_response" />);
    expect(screen.getByText("No Response")).toBeDefined();
  });

  it("opens dropdown with options on click", async () => {
    const user = userEvent.setup();
    render(<RsvpBadgeDropdown tripId="trip-1" status="going" />);

    await user.click(screen.getByRole("button"));

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("Going");
    expect(items[1].textContent).toContain("Maybe");
    expect(items[2].textContent).toContain("Not Going");
  });

  it("calls updateRsvp when selecting a different status", async () => {
    const user = userEvent.setup();
    render(<RsvpBadgeDropdown tripId="trip-1" status="going" />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("menuitem", { name: /Maybe/ }));

    expect(mockUpdateRsvp).toHaveBeenCalledWith(
      { status: "maybe" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("does not call updateRsvp when selecting the current status", async () => {
    const user = userEvent.setup();
    render(<RsvpBadgeDropdown tripId="trip-1" status="going" />);

    await user.click(screen.getByRole("button"));
    const items = screen.getAllByRole("menuitem");
    // First menuitem is "Going" (current status)
    await user.click(items[0]);

    expect(mockUpdateRsvp).not.toHaveBeenCalled();
  });

  it("shows success toast on successful update", async () => {
    mockUpdateRsvp.mockImplementation((_data, options) => {
      options?.onSuccess?.();
    });

    const user = userEvent.setup();
    render(<RsvpBadgeDropdown tripId="trip-1" status="going" />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("menuitem", { name: /Maybe/ }));

    expect(mockToast.success).toHaveBeenCalledWith('RSVP updated to "Maybe"');
  });

  it("shows error toast on failed update", async () => {
    const error = new Error("Network error");
    mockUpdateRsvp.mockImplementation((_data, options) => {
      options?.onError?.(error);
    });

    const user = userEvent.setup();
    render(<RsvpBadgeDropdown tripId="trip-1" status="going" />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("menuitem", { name: /Not Going/ }));

    expect(mockToast.error).toHaveBeenCalledWith("Network error");
  });
});
