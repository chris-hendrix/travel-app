import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock useAuth
const mockLogout = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock profile dialog (uses QueryClient internally)
vi.mock("@/components/profile/profile-dialog", () => ({
  ProfileDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="profile-dialog" onClick={() => onOpenChange(false)}>
        Profile Dialog Mock
      </div>
    ) : null,
}));

// Mock supportsHover to true so onMouseEnter handlers fire in tests
vi.mock("@/lib/supports-hover", () => ({
  supportsHover: true,
}));

// Mock notification hooks
vi.mock("@/hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0, isLoading: false }),
  useNotifications: () => ({ data: undefined, isLoading: false }),
  useMarkAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllAsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { AppHeader } from "../app-header";

let mockPathname = "/trips";

const mockUser = {
  id: "user-1",
  phoneNumber: "+15551234567",
  displayName: "John Doe",
  profilePhotoUrl: undefined,
  timezone: "America/New_York",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/trips";
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      logout: mockLogout,
    });
  });

  it("renders the Tripful wordmark", () => {
    render(<AppHeader />);

    const wordmark = screen.getByText("Tripful");
    expect(wordmark).toBeDefined();
  });

  it("renders the wordmark as a link to /trips", () => {
    render(<AppHeader />);

    const wordmark = screen.getByText("Tripful");
    expect(wordmark.closest("a")?.getAttribute("href")).toBe("/trips");
  });

  it("renders the wordmark in display font", () => {
    render(<AppHeader />);

    const wordmark = screen.getByText("Tripful");
    expect(wordmark.className).toContain("font-display");
  });

  it("renders a header landmark", () => {
    render(<AppHeader />);

    const header = screen.getByRole("banner");
    expect(header).toBeDefined();
  });

  it("renders user avatar button", () => {
    render(<AppHeader />);

    const avatarButton = screen.getByRole("button", { name: "User menu" });
    expect(avatarButton).toBeDefined();
  });

  it("renders user initials in avatar fallback", () => {
    render(<AppHeader />);

    // There are multiple avatar fallbacks (desktop dropdown + mobile menu)
    const initials = screen.getAllByText("JD");
    expect(initials.length).toBeGreaterThan(0);
  });

  it("renders single initial for single-name user", () => {
    mockUseAuth.mockReturnValue({
      user: { ...mockUser, displayName: "Alice" },
      loading: false,
      logout: mockLogout,
    });

    render(<AppHeader />);

    const initials = screen.getAllByText("A");
    expect(initials.length).toBeGreaterThan(0);
  });

  it("renders ? when user is null", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      logout: mockLogout,
    });

    render(<AppHeader />);

    const fallbacks = screen.getAllByText("?");
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it("opens dropdown menu when avatar is clicked", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const avatarButton = screen.getByRole("button", { name: "User menu" });
    await user.click(avatarButton);

    await waitFor(() => {
      expect(screen.getByTestId("profile-menu-item")).toBeDefined();
      expect(screen.getByText("Log out")).toBeDefined();
    });
  });

  it("shows user display name and phone in dropdown", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const avatarButton = screen.getByRole("button", { name: "User menu" });
    await user.click(avatarButton);

    await waitFor(() => {
      expect(screen.getByTestId("profile-menu-item")).toBeDefined();
    });

    // Display name appears in both mobile menu and dropdown, phone in both too
    const displayNames = screen.getAllByText("John Doe");
    expect(displayNames.length).toBeGreaterThan(0);
    const phones = screen.getAllByText("+15551234567");
    expect(phones.length).toBeGreaterThan(0);
  });

  it("calls logout when Log out is clicked", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const avatarButton = screen.getByRole("button", { name: "User menu" });
    await user.click(avatarButton);

    await waitFor(() => {
      expect(screen.getByTestId("profile-menu-item")).toBeDefined();
    });

    // Find the dropdown "Log out" specifically (not the mobile menu one)
    const logoutItems = screen.getAllByText("Log out");
    // The dropdown one is the last rendered
    await user.click(logoutItems[logoutItems.length - 1]);

    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it("shows My Mutuals link in dropdown", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const avatarButton = screen.getByRole("button", { name: "User menu" });
    await user.click(avatarButton);

    await waitFor(() => {
      expect(screen.getByTestId("mutuals-menu-item")).toBeDefined();
    });
  });

  it("My Mutuals link points to /mutuals", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const avatarButton = screen.getByRole("button", { name: "User menu" });
    await user.click(avatarButton);

    await waitFor(() => {
      expect(screen.getByTestId("mutuals-menu-item")).toBeDefined();
    });

    const mutualsLink = screen.getByTestId("mutuals-menu-item").closest("a");
    expect(mutualsLink?.getAttribute("href")).toBe("/mutuals");
  });

  // Mobile menu tests

  it("renders hamburger menu button on mobile", () => {
    render(<AppHeader />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    expect(hamburger).toBeDefined();
    expect(hamburger.className).toContain("md:hidden");
  });

  it("hides desktop dropdown on mobile", () => {
    render(<AppHeader />);

    const userMenuButton = screen.getByRole("button", { name: "User menu" });
    expect(userMenuButton.className).toContain("hidden");
    expect(userMenuButton.className).toContain("md:flex");
  });

  it("opens mobile menu sheet when hamburger is tapped", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    await user.click(hamburger);

    await waitFor(() => {
      expect(screen.getByTestId("mobile-menu-trips-link")).toBeDefined();
      expect(screen.getByTestId("mobile-menu-mutuals-link")).toBeDefined();
    });
  });

  it("shows navigation links in mobile menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    await user.click(hamburger);

    await waitFor(() => {
      const tripsLink = screen.getByTestId("mobile-menu-trips-link");
      expect(tripsLink).toBeDefined();
      expect(tripsLink.textContent).toContain("My Trips");
      expect(tripsLink.getAttribute("href")).toBe("/trips");

      const mutualsLink = screen.getByTestId("mobile-menu-mutuals-link");
      expect(mutualsLink).toBeDefined();
      expect(mutualsLink.textContent).toContain("My Mutuals");
      expect(mutualsLink.getAttribute("href")).toBe("/mutuals");
    });
  });

  it("shows user info in mobile menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    await user.click(hamburger);

    await waitFor(() => {
      const userInfo = screen.getByTestId("mobile-menu-user-info");
      expect(userInfo).toBeDefined();
      expect(userInfo.textContent).toContain("John Doe");
      expect(userInfo.textContent).toContain("+15551234567");
    });
  });

  it("closes mobile menu when a link is clicked", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    await user.click(hamburger);

    await waitFor(() => {
      expect(screen.getByTestId("mobile-menu-trips-link")).toBeDefined();
    });

    const tripsLink = screen.getByTestId("mobile-menu-trips-link");
    await user.click(tripsLink);

    await waitFor(() => {
      // Sheet content should be removed from DOM after closing animation
      expect(screen.queryByTestId("mobile-menu-trips-link")).toBeNull();
    });
  });

  it("calls logout from mobile menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    await user.click(hamburger);

    await waitFor(() => {
      expect(screen.getByTestId("mobile-menu-logout-button")).toBeDefined();
    });

    const logoutButton = screen.getByTestId("mobile-menu-logout-button");
    await user.click(logoutButton);

    expect(mockLogout).toHaveBeenCalledOnce();
  });
});
