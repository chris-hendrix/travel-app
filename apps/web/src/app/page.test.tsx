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

// Import AFTER mocks
import Home from "./page";

describe("Home (landing page)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when auth_token cookie exists", async () => {
    mockGet.mockReturnValue({ name: "auth_token", value: "some-token" });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders landing page when auth_token cookie is missing", async () => {
    mockGet.mockReturnValue(undefined);

    const result = await Home();

    render(result as React.ReactElement);
    expect(screen.getByText("Plan Group Trips Together")).toBeDefined();
    expect(screen.getByText("Get started")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("renders landing page when auth_token cookie has empty value", async () => {
    mockGet.mockReturnValue({ name: "auth_token", value: "" });

    const result = await Home();

    render(result as React.ReactElement);
    expect(screen.getByText("Plan Group Trips Together")).toBeDefined();
    expect(screen.getByText("Get started")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("checks the correct cookie name", async () => {
    mockGet.mockReturnValue(undefined);

    await Home();

    expect(mockGet).toHaveBeenCalledWith("auth_token");
  });
});
