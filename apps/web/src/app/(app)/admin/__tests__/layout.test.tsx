import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLayout from "../layout";

// ---------------------------------------------------------------------------
// Mock useAuth from auth-provider — controllable via a hoisted mock
// ---------------------------------------------------------------------------
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: mockUseAuth,
}));

// ---------------------------------------------------------------------------
// Mock next/navigation — useRouter().push
// ---------------------------------------------------------------------------
const mockRouterPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state when auth is loading", () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: true });

    render(
      <AdminLayout>
        <div data-testid="admin-child">Admin Content</div>
      </AdminLayout>,
    );

    expect(screen.getByText("Loading...")).toBeDefined();
    expect(screen.queryByTestId("admin-child")).toBeNull();
  });

  it("redirects non-admin users to / and renders null", () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: false });

    render(
      <AdminLayout>
        <div data-testid="admin-child">Admin Content</div>
      </AdminLayout>,
    );

    // Children should NOT be rendered
    expect(screen.queryByTestId("admin-child")).toBeNull();
    // Router.push should have been called with "/"
    expect(mockRouterPush).toHaveBeenCalledWith("/");
  });

  it("renders children for admin users", () => {
    mockUseAuth.mockReturnValue({ isAdmin: true, loading: false });

    render(
      <AdminLayout>
        <div data-testid="admin-child">Admin Content</div>
      </AdminLayout>,
    );

    expect(screen.getByTestId("admin-child")).toBeDefined();
    expect(screen.getByText("Admin Content")).toBeDefined();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("does not redirect while still loading, even if not admin", () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: true });

    render(
      <AdminLayout>
        <div data-testid="admin-child">Admin Content</div>
      </AdminLayout>,
    );

    // Shows loading, not redirect
    expect(screen.getByText("Loading...")).toBeDefined();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
