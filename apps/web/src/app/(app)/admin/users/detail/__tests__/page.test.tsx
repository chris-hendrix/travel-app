import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import AdminUserDetailPage from "../client-page";

// ---------------------------------------------------------------------------
// Mock next/navigation — provide controllable useSearchParams.get()
// The component reads the user id from: searchParams.get("id")
// ---------------------------------------------------------------------------
const mockSearchParamsGet = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

// ---------------------------------------------------------------------------
// Mock next/link — renders plain <a> with href
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock @/lib/api — apiRequest returns controllable responses
// ---------------------------------------------------------------------------
const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  apiRequest: mockApiRequest,
  API_URL: "http://localhost:8000/api",
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_USER = {
  id: "user-001",
  phoneNumber: "+15550000001",
  displayName: "Alice Admin",
  profilePhotoUrl: null,
  timezone: "America/Chicago",
  temperatureUnit: "fahrenheit",
  handles: null,
  role: "admin",
  status: "active",
  tripCount: 7,
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-06-01T08:00:00Z",
};

const BANNED_USER = {
  id: "user-003",
  phoneNumber: "+15550000003",
  displayName: "Carol Banned",
  profilePhotoUrl: null,
  timezone: "Europe/London",
  temperatureUnit: "celsius",
  handles: null,
  role: "user",
  status: "banned",
  tripCount: 2,
  createdAt: "2026-04-01T12:00:00Z",
  updatedAt: "2026-05-10T14:00:00Z",
};

const BASIC_USER = {
  id: "user-002",
  phoneNumber: "+15550000002",
  displayName: "Bob User",
  profilePhotoUrl: null,
  timezone: "America/New_York",
  temperatureUnit: "celsius",
  handles: null,
  role: "user",
  status: "active",
  tripCount: 3,
  createdAt: "2026-03-20T08:30:00Z",
  updatedAt: "2026-05-01T09:00:00Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: ReactNode) {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
  return { ...result, queryClient };
}

// Suppress console.error from expected error states (e.g., mutation failures)
function suppressConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminUserDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: search params return "user-001"
    mockSearchParamsGet.mockReturnValue("user-001");
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  // ==================================================================
  // 1. Renders user profile fields
  // ==================================================================
  describe("profile display", () => {
    it("renders user profile fields (name, phone, role, status)", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      // Display name in heading
      expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();

      // Phone number
      expect(screen.getByText("+15550000001")).toBeDefined();

      // Status badge
      expect(screen.getByText("active")).toBeDefined();

      // Role badge
      expect(screen.getByText("admin")).toBeDefined();

      // Trip count
      expect(screen.getByText(/7 trips/)).toBeDefined();

      // Joined date
      expect(
        screen.getByText(/Joined 1\/15\/2026/),
      ).toBeDefined();

      // API was called with correct endpoint
      expect(mockApiRequest).toHaveBeenCalledWith("/admin/users/user-001");
    });

    it("shows profile fields in display (non-edit) mode", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      // Profile section shows field labels
      expect(screen.getByText("Display Name")).toBeDefined();
      expect(screen.getByText("Timezone")).toBeDefined();
      expect(screen.getByText("Temperature")).toBeDefined();

      // Values are rendered
      expect(screen.getByText("America/Chicago")).toBeDefined();
      expect(screen.getByText("fahrenheit")).toBeDefined();
    });

    it("falls back to '-' for missing profile fields", async () => {
      const userWithNullFields = {
        ...BASIC_USER,
        timezone: null,
        temperatureUnit: null,
      };
      mockApiRequest.mockResolvedValue({
        success: true,
        user: userWithNullFields,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      // Missing fields show "-"
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it("shows '(no name)' when displayName is empty", async () => {
      const noNameUser = { ...BASIC_USER, displayName: "" };
      mockApiRequest.mockResolvedValue({
        success: true,
        user: noNameUser,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("(no name)")).toBeDefined();
      });
    });
  });

  // ==================================================================
  // 2. Ban button shows confirmation dialog
  // ==================================================================
  describe("ban confirmation dialog", () => {
    it("shows confirmation dialog when Ban User is clicked", async () => {
      const user = userEvent.setup();
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER, // active, non-admin
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      // Click the Ban User button
      const banButton = screen.getByRole("button", { name: /^Ban User$/ });
      await user.click(banButton);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByRole("alertdialog")).toBeDefined();
      });

      // Dialog title and description
      expect(screen.getByRole("heading", { name: "Ban User" })).toBeDefined();
      expect(
        screen.getByText(/This will suspend the user's account/),
      ).toBeDefined();

      // Cancel and Confirm buttons
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined();
    });

    it("closes confirmation dialog when Cancel is clicked", async () => {
      const user = userEvent.setup();
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      // Open dialog
      await user.click(screen.getByRole("button", { name: /^Ban User$/ }));
      await waitFor(() => {
        expect(screen.getByRole("alertdialog")).toBeDefined();
      });

      // Click Cancel
      await user.click(
        screen.getByRole("button", { name: "Cancel" }),
      );

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
    });

    it("confirming ban calls the ban mutation API", async () => {
      const user = userEvent.setup();
      suppressConsoleError();
      mockSearchParamsGet.mockReturnValue("user-002");

      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      // Open dialog
      await user.click(screen.getByRole("button", { name: /^Ban User$/ }));
      await waitFor(() => {
        expect(screen.getByRole("alertdialog")).toBeDefined();
      });

      // Click Confirm
      await user.click(
        screen.getByRole("button", { name: "Confirm" }),
      );

      // API should be called with ban action
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          "/admin/users/user-002/ban",
          { method: "POST" },
        );
      });
    });
  });

  // ==================================================================
  // 3. Unban button available for banned users
  // ==================================================================
  describe("unban flow", () => {
    it("shows Unban button instead of Ban for banned users", async () => {
      mockSearchParamsGet.mockReturnValue("user-003");
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BANNED_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Carol Banned" })).toBeDefined();
      });

      // Should show Unban User button, not Ban User
      expect(
        screen.getByRole("button", { name: /^Unban User$/ }),
      ).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /^Ban User$/ }),
      ).toBeNull();
    });

    it("shows unban confirmation dialog and calls API on confirm", async () => {
      const user = userEvent.setup();
      suppressConsoleError();

      mockSearchParamsGet.mockReturnValue("user-003");
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BANNED_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Carol Banned" })).toBeDefined();
      });

      // Open dialog
      await user.click(screen.getByRole("button", { name: /^Unban User$/ }));
      await waitFor(() => {
        expect(screen.getByRole("alertdialog")).toBeDefined();
      });

      expect(
        within(screen.getByRole("alertdialog")).getByRole("heading", {
          name: "Unban User",
        }),
      ).toBeDefined();
      expect(
        screen.getByText(/This will restore the user's access/),
      ).toBeDefined();

      // Confirm
      await user.click(
        screen.getByRole("button", { name: "Confirm" }),
      );

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          "/admin/users/user-003/unban",
          { method: "POST" },
        );
      });
    });
  });

  // ==================================================================
  // 4. Promote/demote buttons
  // ==================================================================
  describe("promote/demote", () => {
    it("shows Promote to Admin button for non-admin users", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER, // role: "user", status: "active"
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      expect(
        screen.getByRole("button", { name: /^Promote to Admin$/ }),
      ).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /^Demote from Admin$/ }),
      ).toBeNull();
    });

    it("shows Demote from Admin button for admin users", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER, // role: "admin"
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      expect(
        screen.getByRole("button", { name: /^Demote from Admin$/ }),
      ).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /^Promote to Admin$/ }),
      ).toBeNull();
    });

    it("promote confirmation calls promote mutation", async () => {
      const user = userEvent.setup();
      suppressConsoleError();
      mockSearchParamsGet.mockReturnValue("user-002");

      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      await user.click(
        screen.getByRole("button", { name: /^Promote to Admin$/ }),
      );
      await waitFor(() => {
        expect(screen.getByRole("alertdialog")).toBeDefined();
      });

      expect(
        within(screen.getByRole("alertdialog")).getByRole("heading", {
          name: "Promote to Admin",
        }),
      ).toBeDefined();

      await user.click(
        screen.getByRole("button", { name: "Confirm" }),
      );

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          "/admin/users/user-002/promote",
          { method: "POST" },
        );
      });
    });

    it("demote confirmation calls demote mutation", async () => {
      const user = userEvent.setup();
      suppressConsoleError();

      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      await user.click(
        screen.getByRole("button", { name: /^Demote from Admin$/ }),
      );
      await waitFor(() => {
        expect(screen.getByRole("alertdialog")).toBeDefined();
      });

      expect(
        within(screen.getByRole("alertdialog")).getByRole("heading", {
          name: "Demote from Admin",
        }),
      ).toBeDefined();

      await user.click(
        screen.getByRole("button", { name: "Confirm" }),
      );

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          "/admin/users/user-001/demote",
          { method: "POST" },
        );
      });
    });
  });

  // ==================================================================
  // 5. Loading state
  // ==================================================================
  describe("loading and error states", () => {
    it("shows skeleton loading state while fetching user", () => {
      mockApiRequest.mockImplementationOnce(
        () => new Promise(() => {}),
      );

      renderWithClient(<AdminUserDetailPage />);

      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(2);
    });

    it("shows 'User not found' when API returns no user", async () => {
      mockApiRequest.mockResolvedValue({
        success: false,
        user: null,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("User not found.")).toBeDefined();
      });

      // "Back to user list" link
      expect(
        screen.getByText("Back to user list"),
      ).toBeDefined();
    });

    it("shows 'User not found' when no user id in search params", async () => {
      mockSearchParamsGet.mockReturnValue(null);
      mockApiRequest.mockResolvedValue({ success: false, user: null });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("User not found.")).toBeDefined();
      });
    });
  });

  // ==================================================================
  // 6. Navigation links
  // ==================================================================
  describe("navigation", () => {
    it("renders 'Back to users' link pointing to /admin/users", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      const backLink = screen.getByText("Back to users");
      expect(backLink.closest("a")).toBeDefined();
      expect(backLink.closest("a")?.getAttribute("href")).toBe("/admin/users");
    });
  });

  // ==================================================================
  // 7. Actions section renders with correct buttons for active user
  // ==================================================================
  describe("actions section", () => {
    it("renders actions heading", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      expect(screen.getByText("Actions")).toBeDefined();
    });

    it("shows Ban, Promote, and Impersonate for active non-admin user", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: BASIC_USER,
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      // Active → Ban User button
      expect(screen.getByRole("button", { name: /^Ban User$/ })).toBeDefined();

      // Non-admin → Promote to Admin button
      expect(
        screen.getByRole("button", { name: /^Promote to Admin$/ }),
      ).toBeDefined();

      // Non-admin → Impersonate button
      expect(
        screen.getByRole("button", { name: /^Impersonate$/ }),
      ).toBeDefined();
    });

    it("does not show Impersonate button for admin users", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER, // role: "admin"
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      expect(
        screen.queryByRole("button", { name: /^Impersonate$/ }),
      ).toBeNull();
    });
  });

  // ==================================================================
  // 8. Trip count singular/plural
  // ==================================================================
  describe("trip count text", () => {
    it("uses singular 'trip' when tripCount is 1", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: { ...BASIC_USER, tripCount: 1 },
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Bob User" })).toBeDefined();
      });

      expect(screen.getByText("1 trip")).toBeDefined();
    });

    it("uses plural 'trips' when tripCount is not 1", async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        user: ACTIVE_USER, // tripCount: 7
      });

      renderWithClient(<AdminUserDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Alice Admin" })).toBeDefined();
      });

      expect(screen.getByText("7 trips")).toBeDefined();
    });
  });
});
