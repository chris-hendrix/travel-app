import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import CompleteProfilePage from "./page";

// Mock next/navigation — include useSearchParams
const mockSearchParamsGet = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

// Mock @/lib/constants
vi.mock("@/lib/constants", () => ({
  TIMEZONES: [
    { value: "America/New_York", label: "Eastern Time (US & Canada)" },
    { value: "America/Chicago", label: "Central Time (US & Canada)" },
    { value: "America/Denver", label: "Mountain Time (US & Canada)" },
    { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  ],
  TIMEZONE_AUTO_DETECT: "__auto_detect__",
  getDetectedTimezone: () => "America/New_York",
  getTimezoneLabel: (tz: string) => {
    const labels: Record<string, string> = {
      "America/New_York": "Eastern Time (US & Canada)",
      "America/Chicago": "Central Time (US & Canada)",
      "America/Los_Angeles": "Pacific Time (US & Canada)",
    };
    return labels[tz] || tz;
  },
  getTimezoneAbbr: () => "EST",
}));

// Mock auth provider
const mockCompleteProfile = vi.fn();
let mockUser: any = null;
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    completeProfile: mockCompleteProfile,
    get user() {
      return mockUser;
    },
  }),
}));

// Mock useUploadProfilePhoto
const mockUploadMutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/use-user", () => ({
  useUploadProfilePhoto: () => ({
    mutateAsync: mockUploadMutateAsync,
    isPending: false,
  }),
}));

// Mock getInitials from format
vi.mock("@/lib/format", () => ({
  getInitials: (name: string) =>
    name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "",
}));

describe("CompleteProfilePage", () => {
  const mockPush = vi.fn();
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as any);
    mockCompleteProfile.mockClear();
    mockUploadMutateAsync.mockClear();
    mockPush.mockClear();
    mockSearchParamsGet.mockClear();
    mockUser = null;

    mockCreateObjectURL = vi.fn((file) => `blob:${file.name || "photo"}`);
    mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockFile(name: string, type: string, size: number): File {
    const blob = new Blob(["x".repeat(size)], { type });
    return new File([blob], name, { type });
  }

  it("renders the complete profile form", () => {
    render(<CompleteProfilePage />);

    expect(screen.getByText("Complete your profile")).toBeDefined();
    expect(
      screen.getByText("Tell us a bit about yourself to get started"),
    ).toBeDefined();
    expect(screen.getByLabelText(/display name/i)).toBeDefined();
    expect(screen.getByLabelText(/timezone/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /complete profile/i }),
    ).toBeDefined();
  });

  it("renders photo upload section", () => {
    render(<CompleteProfilePage />);

    expect(screen.getByTestId("profile-avatar")).toBeDefined();
    expect(screen.getByTestId("upload-photo-button")).toBeDefined();
    expect(screen.getByTestId("photo-file-input")).toBeDefined();
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeDefined();
  });

  it("displays validation error for display name that is too short", async () => {
    const user = userEvent.setup();
    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "Jo");
    await user.click(button);

    await waitFor(
      () => {
        const errorMessage = screen.queryByText(
          /display name must be at least 3 characters/i,
        );
        expect(errorMessage).not.toBeNull();
      },
      { timeout: 3000 },
    );

    expect(mockCompleteProfile).not.toHaveBeenCalled();
  });

  it("displays validation error for display name that is too long", async () => {
    const user = userEvent.setup();
    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    const longName = "a".repeat(51);
    await user.click(input);
    await user.paste(longName);
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText(
        "Display name must not exceed 50 characters",
      );
      expect(errorMessage).toBeTruthy();
    });

    expect(mockCompleteProfile).not.toHaveBeenCalled();
  });

  it("displays validation error for empty display name", async () => {
    const user = userEvent.setup();
    render(<CompleteProfilePage />);

    const button = screen.getByRole("button", { name: /complete profile/i });
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText(
        /display name must be at least 3 characters/i,
      );
      expect(errorMessage).toBeTruthy();
    });

    expect(mockCompleteProfile).not.toHaveBeenCalled();
  });

  it("calls completeProfile with correct data on submit", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockResolvedValue(undefined);

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "John Doe");
    await user.click(button);

    await waitFor(() => {
      expect(mockCompleteProfile).toHaveBeenCalledWith({
        displayName: "John Doe",
      });
    });
  });

  it("redirects to trips on successful profile completion", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockImplementation(async () => {
      mockUser = {
        id: "1",
        displayName: "John Doe",
        phoneNumber: "+15551234567",
      };
    });

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "John Doe");
    await user.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("displays error message on API failure", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockRejectedValue(
      new Error("Profile completion failed"),
    );

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "John Doe");
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText("Profile completion failed");
      expect(errorMessage).toBeTruthy();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("disables button and shows loading state while submitting", async () => {
    const user = userEvent.setup();
    let resolveCompleteProfile: () => void;
    mockCompleteProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveCompleteProfile = resolve as () => void;
      }),
    );

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "John Doe");
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", true);
      const savingText = screen.queryByText("Saving...");
      expect(savingText).toBeTruthy();
    });

    // Resolve the promise and set user - this triggers navigation
    mockUser = {
      id: "1",
      displayName: "John Doe",
      phoneNumber: "+15551234567",
    };
    resolveCompleteProfile!();

    // After successful completion, button stays disabled until navigation
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("shows helper text for display name", () => {
    render(<CompleteProfilePage />);

    expect(
      screen.getByText("This is how others will see you on the platform"),
    ).toBeDefined();
  });

  it("shows helper text for timezone", () => {
    render(<CompleteProfilePage />);

    expect(
      screen.getByText("Used to show you times in your local timezone"),
    ).toBeDefined();
  });

  it("shows settings disclaimer text", () => {
    render(<CompleteProfilePage />);

    expect(
      screen.getByText(
        "You can update this information later in your settings",
      ),
    ).toBeDefined();
  });

  it("defaults timezone to auto-detect", () => {
    render(<CompleteProfilePage />);

    // The timezone select should show the auto-detect option by default
    const timezoneSelect = screen.getByRole("combobox", { name: /timezone/i });
    expect(timezoneSelect).toBeDefined();
    // The auto-detect option text should be visible (may appear in both
    // the visible trigger and a hidden native <option>)
    const autoDetectElements = screen.getAllByText(/Auto-detect/);
    expect(autoDetectElements.length).toBeGreaterThan(0);
  });

  it("submits without timezone when auto-detect is selected", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockResolvedValue(undefined);

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    await user.type(input, "John Doe");

    const button = screen.getByRole("button", { name: /complete profile/i });
    await user.click(button);

    await waitFor(() => {
      // When auto-detect is selected (default), timezone should not be sent
      expect(mockCompleteProfile).toHaveBeenCalledWith({
        displayName: "John Doe",
      });
    });
  });

  it("auto-focuses the display name input on mount", () => {
    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    expect(document.activeElement).toBe(input);
  });

  it("handles generic error without message", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockRejectedValue(new Error());

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "John Doe");
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText("Failed to complete profile");
      expect(errorMessage).toBeTruthy();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("disables form inputs while submitting", async () => {
    const user = userEvent.setup();
    let resolveCompleteProfile: () => void;
    mockCompleteProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveCompleteProfile = resolve as () => void;
      }),
    );

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    const button = screen.getByRole("button", { name: /complete profile/i });

    await user.type(input, "John Doe");
    await user.click(button);

    await waitFor(() => {
      expect(input).toHaveProperty("disabled", true);
    });

    // Resolve the promise and set user - this triggers navigation
    mockUser = {
      id: "1",
      displayName: "John Doe",
      phoneNumber: "+15551234567",
    };
    resolveCompleteProfile!();

    // After successful completion, inputs stay disabled until navigation
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("shows photo preview after file selection", async () => {
    const user = userEvent.setup();
    render(<CompleteProfilePage />);

    const fileInput = screen.getByTestId("photo-file-input");
    const file = createMockFile("photo.jpg", "image/jpeg", 1024);

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
      // Button should change to "Change photo" after selecting a file
      expect(
        screen.getByRole("button", { name: /change photo/i }),
      ).toBeDefined();
      // Remove button should appear
      expect(screen.getByTestId("remove-photo-button")).toBeDefined();
    });
  });

  it("removes photo preview when remove button is clicked", async () => {
    const user = userEvent.setup();
    render(<CompleteProfilePage />);

    const fileInput = screen.getByTestId("photo-file-input");
    const file = createMockFile("photo.jpg", "image/jpeg", 1024);

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId("remove-photo-button")).toBeDefined();
    });

    const removeButton = screen.getByTestId("remove-photo-button");
    await user.click(removeButton);

    await waitFor(() => {
      // After removal, button should go back to "Upload photo"
      expect(
        screen.getByRole("button", { name: /upload photo/i }),
      ).toBeDefined();
      // Remove button should be gone
      expect(screen.queryByTestId("remove-photo-button")).toBeNull();
    });
  });

  it("uploads photo after successful profile completion", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockResolvedValue(undefined);
    mockUploadMutateAsync.mockResolvedValue({});

    render(<CompleteProfilePage />);

    // Select a photo first
    const fileInput = screen.getByTestId("photo-file-input");
    const file = createMockFile("photo.jpg", "image/jpeg", 1024);
    await user.upload(fileInput, file);

    // Fill in display name and submit
    const input = screen.getByLabelText(/display name/i);
    await user.type(input, "John Doe");

    const button = screen.getByRole("button", { name: /complete profile/i });
    await user.click(button);

    await waitFor(() => {
      // Profile should be completed first
      expect(mockCompleteProfile).toHaveBeenCalledWith({
        displayName: "John Doe",
      });
      // Photo should be uploaded after profile completion
      expect(mockUploadMutateAsync).toHaveBeenCalledWith(expect.any(File));
      // Should redirect to trips
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("continues to redirect even if photo upload fails", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockResolvedValue(undefined);
    mockUploadMutateAsync.mockRejectedValue(new Error("Upload failed"));

    render(<CompleteProfilePage />);

    // Select a photo
    const fileInput = screen.getByTestId("photo-file-input");
    const file = createMockFile("photo.jpg", "image/jpeg", 1024);
    await user.upload(fileInput, file);

    // Fill in display name and submit
    const input = screen.getByLabelText(/display name/i);
    await user.type(input, "John Doe");

    const button = screen.getByRole("button", { name: /complete profile/i });
    await user.click(button);

    await waitFor(() => {
      // Even though photo upload failed, redirect should happen
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("does not upload photo if no file was selected", async () => {
    const user = userEvent.setup();
    mockCompleteProfile.mockResolvedValue(undefined);

    render(<CompleteProfilePage />);

    const input = screen.getByLabelText(/display name/i);
    await user.type(input, "John Doe");

    const button = screen.getByRole("button", { name: /complete profile/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockCompleteProfile).toHaveBeenCalled();
      expect(mockUploadMutateAsync).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("does not accept files with invalid types", async () => {
    const user = userEvent.setup();
    render(<CompleteProfilePage />);

    const fileInput = screen.getByTestId("photo-file-input");
    const file = createMockFile("document.pdf", "application/pdf", 1024);

    await user.upload(fileInput, file);

    // Should not show preview for invalid type
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /upload photo/i }),
      ).toBeDefined();
      expect(screen.queryByTestId("remove-photo-button")).toBeNull();
    });
  });

  it("shows avatar fallback with question mark when no name entered", () => {
    render(<CompleteProfilePage />);

    expect(screen.getByText("?")).toBeDefined();
  });
});
