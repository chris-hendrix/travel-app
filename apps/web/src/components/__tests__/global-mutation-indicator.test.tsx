import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseMutationState = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useMutationState: mockUseMutationState,
  };
});

import { GlobalMutationIndicator } from "../global-mutation-indicator";

describe("GlobalMutationIndicator", () => {
  beforeEach(() => {
    mockUseMutationState.mockReset();
  });

  it("renders nothing when no mutations are pending", () => {
    mockUseMutationState.mockReturnValue([]);

    const { container } = render(<GlobalMutationIndicator />);

    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders a progress bar when mutations are pending", () => {
    mockUseMutationState.mockReturnValue([{ status: "pending" }]);

    render(<GlobalMutationIndicator />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeDefined();
  });

  it("has correct aria-label for accessibility", () => {
    mockUseMutationState.mockReturnValue([{ status: "pending" }]);

    render(<GlobalMutationIndicator />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-label")).toBe("Saving changes");
  });

  it("renders nothing when mutations complete", () => {
    mockUseMutationState.mockReturnValue([{ status: "pending" }]);

    const { rerender } = render(<GlobalMutationIndicator />);
    expect(screen.getByRole("progressbar")).toBeDefined();

    // Mutations complete
    mockUseMutationState.mockReturnValue([]);
    rerender(<GlobalMutationIndicator />);

    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders for multiple pending mutations", () => {
    mockUseMutationState.mockReturnValue([
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
    ]);

    render(<GlobalMutationIndicator />);

    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("calls useMutationState with pending filter", () => {
    mockUseMutationState.mockReturnValue([]);

    render(<GlobalMutationIndicator />);

    expect(mockUseMutationState).toHaveBeenCalledWith({
      filters: { status: "pending" },
    });
  });
});
