import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RsvpPills } from "../rsvp-pills";

const mockMutate = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/use-invitations", () => ({
  useUpdateRsvp: () => ({ mutate: mockMutate, isPending: false }),
  getUpdateRsvpErrorMessage: () => "Failed to update RSVP",
}));

describe("RsvpPills", () => {
  it("exposes aria-pressed on controlled pills with the active status pressed", () => {
    render(<RsvpPills status="maybe" onSelect={() => {}} includeNoResponse />);
    expect(
      screen.getByRole("button", { name: "Maybe" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Going" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "No response" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("controlled onSelect receives the picked value", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RsvpPills status="going" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Maybe" }));
    expect(onSelect).toHaveBeenCalledWith("maybe");
  });

  it("uncontrolled path never offers no_response (self-RSVP mutation has no such value)", () => {
    render(<RsvpPills tripId="trip-1" status="going" includeNoResponse />);
    expect(screen.queryByRole("button", { name: "No response" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Going" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("uncontrolled click fires the self-RSVP mutation", async () => {
    const user = userEvent.setup();
    render(<RsvpPills tripId="trip-1" status="going" />);
    await user.click(screen.getByRole("button", { name: "Maybe" }));
    expect(mockMutate).toHaveBeenCalledWith(
      { status: "maybe" },
      expect.anything(),
    );
  });
});
