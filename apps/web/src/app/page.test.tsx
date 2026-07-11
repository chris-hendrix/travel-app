import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock HomePageClient — it uses useAuth() which needs AuthProvider context;
// we unit-test page.tsx's responsibility: rendering the script + delegate component.
vi.mock("./home-page-client", () => ({
  HomePageClient: () => <div data-testid="home-page-client">HomePageClient</div>,
}));

import Home from "./page";

describe("Home (landing page)", () => {
  it("renders the Capacitor native redirect script", () => {
    const { container } = render(<Home />);
    const script = container.querySelector("script");
    expect(script).toBeTruthy();
    expect(script?.innerHTML).toContain("location.replace('/login.html')");
  });

  it("renders HomePageClient", () => {
    const { getByTestId } = render(<Home />);
    expect(getByTestId("home-page-client")).toBeTruthy();
  });

  it("does NOT call cookies() or redirect() — auth is handled client-side", () => {
    // Home() is a sync component. It should not throw.
    expect(() => render(<Home />)).not.toThrow();
  });
});
