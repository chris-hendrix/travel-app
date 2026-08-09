import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import AdminUsersPage from "../page";

// ---------------------------------------------------------------------------
// Mock @/lib/api — apiRequest returns controllable responses
// ---------------------------------------------------------------------------
const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  apiRequest: mockApiRequest,
  API_URL: "http://localhost:8000/api",
}));

// ---------------------------------------------------------------------------
// Mock next/navigation — useRouter().push
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USERS_RESPONSE = {
  success: true,
  users: [
    {
      id: "user-001",
      phoneNumber: "+15550000001",
      displayName: "Alice Admin",
      role: "admin",
      status: "active",
      createdAt: "2026-01-15T10:00:00Z",
    },
    {
      id: "user-002",
      phoneNumber: "+15550000002",
      displayName: "Bob User",
      role: "user",
      status: "active",
      createdAt: "2026-03-20T08:30:00Z",
    },
    {
      id: "user-003",
      phoneNumber: "+15550000003",
      displayName: "Carol Banned",
      role: "user",
      status: "banned",
      createdAt: "2026-04-01T12:00:00Z",
    },
  ],
  total: 3,
  page: 1,
  limit: 20,
};

const EMPTY_RESPONSE = {
  success: true,
  users: [] as typeof ADMIN_USERS_RESPONSE.users,
  total: 0,
  page: 1,
  limit: 20,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Flush pending async operations
    await new Promise((r) => setTimeout(r, 0));
  });

  // ------------------------------------------------------------------
  // 1. Renders user table with rows
  // ------------------------------------------------------------------
  it("renders user table with rows from the API response", async () => {
    mockApiRequest.mockResolvedValueOnce(ADMIN_USERS_RESPONSE);

    renderWithClient(<AdminUsersPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeDefined();
    });

    // User names in table
    expect(screen.getByText("Bob User")).toBeDefined();
    expect(screen.getByText("Carol Banned")).toBeDefined();

    // Phone numbers
    expect(screen.getByText("+15550000001")).toBeDefined();
    expect(screen.getByText("+15550000002")).toBeDefined();

    // Status badges
    const activeBadges = screen.getAllByText("active");
    expect(activeBadges.length).toBeGreaterThanOrEqual(2); // Alice + Bob
    expect(screen.getByText("banned")).toBeDefined();

    // Role: Alice has admin role badge
    const adminBadges = screen.getAllByText("admin");
    expect(adminBadges.length).toBeGreaterThanOrEqual(1);

    // Page heading
    expect(screen.getByText("User Management")).toBeDefined();

    // API was called correctly
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.stringContaining("/admin/users"),
    );
  });

  // ------------------------------------------------------------------
  // 2. Role/status badges are visible
  // ------------------------------------------------------------------
  it("renders correct role and status badges", async () => {
    mockApiRequest.mockResolvedValueOnce(ADMIN_USERS_RESPONSE);

    renderWithClient(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeDefined();
    });

    // Check badge variants via data-slot attribute
    const badges = document.querySelectorAll('[data-slot="badge"]');
    const badgeTexts = Array.from(badges).map((b) => b.textContent);
    expect(badgeTexts).toContain("active");
    expect(badgeTexts).toContain("banned");
    expect(badgeTexts).toContain("admin");
  });

  // ------------------------------------------------------------------
  // 3. Shows loading state while fetching
  // ------------------------------------------------------------------
  it("shows skeleton loading state while fetching", () => {
    // Never resolve — keeps component in loading state
    mockApiRequest.mockImplementationOnce(
      () => new Promise(() => {}),
    );

    renderWithClient(<AdminUsersPage />);

    // Skeleton elements should be present
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);

    // Table should NOT be rendered yet
    expect(screen.queryByText("Alice Admin")).toBeNull();
  });

  // ------------------------------------------------------------------
  // 4. Shows empty state when no users
  // ------------------------------------------------------------------
  it("shows empty state when no users match", async () => {
    mockApiRequest.mockResolvedValueOnce(EMPTY_RESPONSE);

    renderWithClient(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText("No users found")).toBeDefined();
    });

    // No user rows rendered
    expect(screen.queryByText("Alice Admin")).toBeNull();
  });

  // ------------------------------------------------------------------
  // 5. Search/filter triggers API call with correct params
  // ------------------------------------------------------------------
  it("filters users via search input (debounced API call)", async () => {
    const user = userEvent.setup();

    // First call: load all users
    mockApiRequest.mockResolvedValueOnce(ADMIN_USERS_RESPONSE);
    // Second call: search results
    mockApiRequest.mockResolvedValueOnce({
      ...ADMIN_USERS_RESPONSE,
      users: [ADMIN_USERS_RESPONSE.users[0]],
      total: 1,
    });

    renderWithClient(<AdminUsersPage />);

    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeDefined();
    });
    expect(mockApiRequest).toHaveBeenCalledTimes(1);

    // Type search query
    const searchInput = screen.getByPlaceholderText(
      "Search by name, phone, or ID...",
    );
    await user.type(searchInput, "Alice");

    // Wait for the second API call with search param (300ms debounce + network)
    await waitFor(
      () => {
        expect(mockApiRequest).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    const lastCall = mockApiRequest.mock.calls[1][0] as string;
    expect(lastCall).toContain("search=Alice");
  });

  // ------------------------------------------------------------------
  // 6. Pagination info is displayed
  // ------------------------------------------------------------------
  it("displays pagination info with user count", async () => {
    // Component only renders pagination when totalPages > 1.
    // Need total > limit (20) so Math.ceil(total/limit) >= 2.
    mockApiRequest.mockResolvedValueOnce({
      ...ADMIN_USERS_RESPONSE,
      total: 25,
      page: 1,
    });

    renderWithClient(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeDefined();
    });

    // Pagination shows "Page 1 of 2 (25 users)"
    expect(screen.getByText(/Page 1 of 2/)).toBeDefined();
    expect(screen.getByText(/25 users/)).toBeDefined();
  });

  // ------------------------------------------------------------------
  // 7. User names link to detail page via query param
  // ------------------------------------------------------------------
  it("links user names to admin user detail page with id query param", async () => {
    mockApiRequest.mockResolvedValueOnce(ADMIN_USERS_RESPONSE);

    renderWithClient(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeDefined();
    });

    // Link should point to /admin/users/detail?id=user-001
    const link = screen.getByText("Alice Admin").closest("a");
    expect(link).toBeDefined();
    expect(link?.getAttribute("href")).toBe("/admin/users/detail?id=user-001");
  });
});
