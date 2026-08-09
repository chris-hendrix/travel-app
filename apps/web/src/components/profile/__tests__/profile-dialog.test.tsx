import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileDialog } from "../profile-dialog";
import type { User } from "@journiful/shared/types";

// ---------------------------------------------------------------------------
// Hoisted mocks (available inside vi.mock factory functions)
// ---------------------------------------------------------------------------
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

// ---------------------------------------------------------------------------
// Mutation mock functions – mutate receives (data, { onSuccess, onError })
// The real use-user hooks call toast.success internally, so our mock
// simulates that so callers can assert on the toast.
// ---------------------------------------------------------------------------
const mockUpdateMutate = vi.fn(
  (_data: unknown, options?: { onSuccess?: () => void; onError?: () => void }) => {
    mockToast.success("Profile updated successfully");
    options?.onSuccess?.();
  },
);

const mockUploadMutate = vi.fn(
  (_file: unknown, options?: { onSuccess?: () => void; onError?: () => void }) => {
    mockToast.success("Profile photo updated");
    options?.onSuccess?.();
  },
);

const mockRemoveMutate = vi.fn(
  (_void: unknown, options?: { onSuccess?: () => void; onError?: () => void }) => {
    mockToast.success("Profile photo removed");
    options?.onSuccess?.();
  },
);

// ---------------------------------------------------------------------------
// Global module mocks
// ---------------------------------------------------------------------------
vi.mock("@/hooks/use-user", () => ({
  useUpdateProfile: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
  useUploadProfilePhoto: () => ({
    mutate: mockUploadMutate,
    isPending: false,
  }),
  useRemoveProfilePhoto: () => ({
    mutate: mockRemoveMutate,
    isPending: false,
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  API_URL: "http://localhost:8000/api",
  APIError: class APIError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  },
  getUploadUrl: (path: string | null | undefined) => path ?? undefined,
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/format", () => ({
  formatPhoneNumber: (phone: string) => phone,
  getInitials: (name: string) => name.slice(0, 2).toUpperCase(),
}));

vi.mock("../calendar-sync-section", () => ({
  CalendarSyncSection: () => <div data-testid="calendar-sync-section" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default mock user fixture */
const mockUser: User = {
  id: "user-1",
  phoneNumber: "+15551112222",
  displayName: "Alice",
  timezone: "America/New_York",
  profilePhotoUrl: undefined,
  handles: { venmo: "@alice", instagram: "" },
  temperatureUnit: "fahrenheit",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Full return shape for useAuth() matching AuthContextType */
function makeAuthContext(overrides?: { user?: Partial<User> }) {
  const user = overrides?.user
    ? ({ ...mockUser, ...overrides.user } as User)
    : mockUser;

  return {
    user,
    loading: false,
    isAdmin: false,
    impersonating: { active: false },
    login: vi.fn(),
    verify: vi.fn(),
    completeProfile: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
    stopImpersonating: vi.fn(),
  };
}

/**
 * Render ProfileDialog wrapped in QueryClientProvider.
 * Defaults: open=true, onOpenChange=noop, auth=default user.
 */
function renderDialog(options?: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  user?: Partial<User>;
}) {
  const open = options?.open ?? true;
  const onOpenChange = options?.onOpenChange ?? vi.fn();

  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue(makeAuthContext({ user: options?.user }));

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ProfileDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );

  return { onOpenChange, queryClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ProfileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // --- Test 1: Form fields pre-populated from useAuth user ---
  describe("form field pre-population", () => {
    it("pre-populates display name from user", async () => {
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("display-name-input") as HTMLInputElement;
        expect(input.value).toBe("Alice");
      });
    });

    it("pre-populates phone number from user (read-only)", async () => {
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("phone-number-input") as HTMLInputElement;
        expect(input.value).toBe("+15551112222");
      });
    });

    it("pre-populates timezone select from user", async () => {
      renderDialog();

      await waitFor(() => {
        const trigger = screen.getByTestId("timezone-select");
        expect(trigger.textContent).toContain("Eastern Time (ET)");
      });
    });

    it("pre-populates venmo handle from user", async () => {
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("venmo-handle-input") as HTMLInputElement;
        expect(input.value).toBe("@alice");
      });
    });

    it("pre-populates temperature unit from user", async () => {
      renderDialog();

      await waitFor(() => {
        const trigger = screen.getByTestId("temperature-unit-select");
        expect(trigger.textContent).toContain("Fahrenheit");
      });
    });
  });

  // --- Test 2: Save calls mutation with updated values ---
  describe("save action", () => {
    it("calls update mutation with updated display name", async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("display-name-input") as HTMLInputElement;
        expect(input.value).toBe("Alice");
      });

      const nameInput = screen.getByTestId("display-name-input");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob");

      const saveButton = screen.getByTestId("save-profile-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
      });

      const mutateArg = mockUpdateMutate.mock.calls[0][0] as Record<string, unknown>;
      expect(mutateArg.displayName).toBe("Bob");
    });

    it("passes timezone and temperature unit in mutation", async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("display-name-input") as HTMLInputElement;
        expect(input.value).toBe("Alice");
      });

      const saveButton = screen.getByTestId("save-profile-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
      });

      const mutateArg = mockUpdateMutate.mock.calls[0][0] as Record<string, unknown>;
      expect(mutateArg.timezone).toBe("America/New_York");
      expect(mutateArg.temperatureUnit).toBe("fahrenheit");
    });

    it("passes handles in mutation", async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("display-name-input") as HTMLInputElement;
        expect(input.value).toBe("Alice");
      });

      const saveButton = screen.getByTestId("save-profile-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
      });

      const mutateArg = mockUpdateMutate.mock.calls[0][0] as Record<string, unknown>;
      expect(mutateArg.handles).toEqual({ venmo: "@alice" });
    });
  });

  // --- Test 3: Toast on success ---
  describe("toast on success", () => {
    it("shows success toast after profile update", async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        const input = screen.getByTestId("display-name-input") as HTMLInputElement;
        expect(input.value).toBe("Alice");
      });

      const nameInput = screen.getByTestId("display-name-input");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob");

      const saveButton = screen.getByTestId("save-profile-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          "Profile updated successfully",
        );
      });
    });
  });

  // --- Test 4: Photo upload button text ---
  describe("photo upload button text", () => {
    it('shows "Upload photo" when user has no profile photo', async () => {
      renderDialog({ user: { profilePhotoUrl: undefined } });

      await waitFor(() => {
        const button = screen.getByTestId("upload-photo-button");
        expect(button.textContent).toContain("Upload photo");
      });
    });

    it('shows "Change photo" when user has a profile photo', async () => {
      renderDialog({ user: { profilePhotoUrl: "photos/user-1/avatar.jpg" } });

      await waitFor(() => {
        const button = screen.getByTestId("upload-photo-button");
        expect(button.textContent).toContain("Change photo");
      });
    });
  });

  // --- Test 5: Remove photo button visibility ---
  describe("remove photo button", () => {
    it("is visible when user has a profile photo", async () => {
      renderDialog({ user: { profilePhotoUrl: "photos/user-1/avatar.jpg" } });

      await waitFor(() => {
        const button = screen.getByTestId("remove-photo-button");
        expect(button).toBeDefined();
        expect(button.textContent).toContain("Remove");
      });
    });

    it("is not rendered when user has no profile photo", async () => {
      renderDialog({ user: { profilePhotoUrl: undefined } });

      await waitFor(() => {
        expect(screen.getByTestId("upload-photo-button")).toBeDefined();
      });

      expect(
        screen.queryByTestId("remove-photo-button"),
      ).toBeNull();
    });
  });
});
