import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthGuard } from "../components/auth-guard";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// Mock the API
vi.mock("../lib/api", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../lib/api";
import { redirect } from "next/navigation";

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    // Don't resolve the API call yet
    vi.mocked(apiRequest).mockReturnValue(new Promise(() => {}));
    render(
      <AuthGuard>
        <div data-testid="child">Protected Content</div>
      </AuthGuard>
    );
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("renders children when authenticated", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ user: { id: "1" } });
    render(
      <AuthGuard>
        <div data-testid="child">Protected Content</div>
      </AuthGuard>
    );
    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeDefined();
    });
  });

  it("redirects to /login when unauthenticated", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("Unauthorized"));
    render(
      <AuthGuard>
        <div data-testid="child">Protected Content</div>
      </AuthGuard>
    );
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("/login");
    });
  });

  it("calls /api/auth/me to verify authentication", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ user: { id: "1" } });
    render(
      <AuthGuard>
        <div data-testid="child">Protected Content</div>
      </AuthGuard>
    );
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/auth/me");
    });
  });
});
