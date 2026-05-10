import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/headers
const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockGet,
  })),
}));

// Mock next/navigation
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

// Mock AppHeader (client component)
vi.mock("@/components/app-header", () => ({
  AppHeader: () => <header data-testid="app-header">App Header</header>,
}));

// Mock ImpersonationBanner (client component using useAuth)
vi.mock("@/components/impersonation-banner", () => ({
  ImpersonationBanner: () => null,
}));

// Mock GlobalMutationIndicator (client component using TanStack Query)
vi.mock("@/components/global-mutation-indicator", () => ({
  GlobalMutationIndicator: () => null,
}));

// Mock QueryErrorBoundaryWrapper (client component using TanStack Query)
vi.mock("@/components/query-error-boundary-wrapper", () => ({
  QueryErrorBoundaryWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Import AFTER mocks
import ProtectedLayout from "./layout";

describe("ProtectedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when auth_token cookie exists", async () => {
    mockGet.mockReturnValue({ value: "valid-jwt-token" });

    const result = await ProtectedLayout({
      children: <div>Protected Content</div>,
    });

    // render the result to check it renders children
    render(result as React.ReactElement);
    expect(screen.getByText("Protected Content")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("renders AppHeader when authenticated", async () => {
    mockGet.mockReturnValue({ value: "valid-jwt-token" });

    const result = await ProtectedLayout({
      children: <div>Protected Content</div>,
    });

    render(result as React.ReactElement);
    expect(screen.getByTestId("app-header")).toBeDefined();
  });

  it("wraps children in a main landmark", async () => {
    mockGet.mockReturnValue({ value: "valid-jwt-token" });

    const result = await ProtectedLayout({
      children: <div>Protected Content</div>,
    });

    render(result as React.ReactElement);
    const main = screen.getByRole("main");
    expect(main).toBeDefined();
    expect(main.id).toBe("main-content");
    expect(main.textContent).toContain("Protected Content");
  });

  it("redirects to /login when auth_token cookie is missing", async () => {
    mockGet.mockReturnValue(undefined);

    await expect(
      ProtectedLayout({
        children: <div>Protected Content</div>,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when auth_token cookie has no value", async () => {
    mockGet.mockReturnValue({ value: "" });

    await expect(
      ProtectedLayout({
        children: <div>Protected Content</div>,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("checks the correct cookie name", async () => {
    mockGet.mockReturnValue({ value: "some-token" });

    await ProtectedLayout({
      children: <div>Content</div>,
    });

    expect(mockGet).toHaveBeenCalledWith("auth_token");
  });
});
