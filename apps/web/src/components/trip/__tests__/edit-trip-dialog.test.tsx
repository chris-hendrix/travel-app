import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditTripDialog } from "../edit-trip-dialog";
import type { Trip } from "@/hooks/use-trips";

// Mock sonner
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock the API module
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  getUploadUrl: (path: string | null | undefined) => path ?? undefined,
  APIError: class APIError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("EditTripDialog", () => {
  const mockOnOpenChange = vi.fn();
  let queryClient: QueryClient;

  const mockTrip: Trip = {
    id: "trip-123",
    name: "Existing Trip",
    destination: "Miami, FL",
    startDate: "2026-07-01",
    endDate: "2026-07-15",
    preferredTimezone: "America/New_York",
    description: "A fun summer trip",
    coverImageUrl: "https://example.com/image.jpg",
    createdBy: "user-123",
    allowMembersToAddEvents: true,
    showAllMembers: false,
    cancelled: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  beforeEach(() => {
    mockOnOpenChange.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();

    // Create a new QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    // Mock console.log and console.error to avoid test output noise
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Helper function to render component with QueryClientProvider
  const renderWithQueryClient = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  describe("Dialog open/close behavior", () => {
    it("renders dialog when open is true", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      expect(screen.getByText("Edit trip")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      expect(screen.queryByText("Edit trip")).toBeNull();
    });

    it("calls onOpenChange when close button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Form pre-population", () => {
    it("pre-populates all fields with trip data", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const nameInput = screen.getByLabelText(/trip name/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Existing Trip");

      const destinationInput = screen.getByLabelText(
        /destination/i,
      ) as HTMLInputElement;
      expect(destinationInput.value).toBe("Miami, FL");

      // DatePicker buttons should show formatted dates
      const startDateButton = screen.getByRole("button", {
        name: /start date/i,
      });
      expect(startDateButton.textContent).toMatch(/jul 1, 2026/i);

      const endDateButton = screen.getByRole("button", { name: /end date/i });
      expect(endDateButton.textContent).toMatch(/jul 15, 2026/i);

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      expect(descriptionInput.value).toBe("A fun summer trip");

      const checkbox = screen.getByRole("checkbox", {
        name: /allow members to add events/i,
      });
      expect(checkbox.getAttribute("data-state")).toBe("checked");

      const showAllMembersCheckbox = screen.getByRole("checkbox", {
        name: /show all invited members/i,
      });
      expect(showAllMembersCheckbox.getAttribute("data-state")).toBe(
        "unchecked",
      );
    });

    it("handles null description gracefully", () => {
      const tripWithoutDescription = {
        ...mockTrip,
        description: null,
      };

      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={tripWithoutDescription}
        />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      expect(descriptionInput.value).toBe("");
    });

    it("handles null dates gracefully", () => {
      const tripWithoutDates = {
        ...mockTrip,
        startDate: null,
        endDate: null,
      };

      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={tripWithoutDates}
        />,
      );

      // DatePicker buttons should show placeholder text when no date is set
      const startDateButton = screen.getByRole("button", {
        name: /start date/i,
      });
      expect(startDateButton).toBeDefined();

      const endDateButton = screen.getByRole("button", { name: /end date/i });
      expect(endDateButton).toBeDefined();
    });

    it("resets form when dialog reopens", async () => {
      const user = userEvent.setup();
      const { rerender } = renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      // Modify a field
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Modified Name");

      // Close dialog
      rerender(
        <QueryClientProvider client={queryClient}>
          <EditTripDialog
            open={false}
            onOpenChange={mockOnOpenChange}
            trip={mockTrip}
          />
        </QueryClientProvider>,
      );

      // Reopen dialog
      rerender(
        <QueryClientProvider client={queryClient}>
          <EditTripDialog
            open={true}
            onOpenChange={mockOnOpenChange}
            trip={mockTrip}
          />
        </QueryClientProvider>,
      );

      // Form should reset to original values
      await waitFor(() => {
        const nameInputAfterReopen = screen.getByLabelText(
          /trip name/i,
        ) as HTMLInputElement;
        expect(nameInputAfterReopen.value).toBe("Existing Trip");
      });
    });
  });

  describe("Field validation", () => {
    it("shows error when trip name is too short", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "AB");
      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/trip name must be at least 3 characters/i),
        ).toBeDefined();
      });
    });

    it("shows error when destination is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.clear(destinationInput);
      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(screen.getByText(/destination is required/i)).toBeDefined();
      });
    });

    it("renders date picker buttons with pre-populated dates", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      // DatePicker buttons should show formatted dates
      const startDateButton = screen.getByRole("button", {
        name: /start date/i,
      });
      expect(startDateButton.textContent).toMatch(/jul 1, 2026/i);

      const endDateButton = screen.getByRole("button", { name: /end date/i });
      expect(endDateButton.textContent).toMatch(/jul 15, 2026/i);
    });
  });

  describe("Update mutation", () => {
    it("calls API with updated trip data on submit", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: {
          ...mockTrip,
          name: "Updated Trip Name",
          description: "Updated description",
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Trip Name");

      const descriptionInput = screen.getByLabelText(/description/i);
      await user.clear(descriptionInput);
      await user.type(descriptionInput, "Updated description");

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips/trip-123",
          expect.objectContaining({
            method: "PUT",
            body: expect.stringContaining("Updated Trip Name"),
          }),
        );
      });
    });

    it("closes dialog on successful update", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: { ...mockTrip, name: "Updated Trip Name" },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("calls onSuccess callback after successful update", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: { ...mockTrip, name: "Updated Trip Name" },
      });

      const mockOnSuccess = vi.fn();
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
          onSuccess={mockOnSuccess}
        />,
      );

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("does not call onSuccess callback when update fails", async () => {
      const { apiRequest, APIError } = await import("@/lib/api");
      vi.mocked(apiRequest).mockRejectedValueOnce(
        new APIError("PERMISSION_DENIED", "Permission denied"),
      );

      const mockOnSuccess = vi.fn();
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
          onSuccess={mockOnSuccess}
        />,
      );

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.stringMatching(/you don't have permission to edit this trip/i),
        );
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    it("shows loading state during update", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  trip: mockTrip,
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      expect(
        screen.getByRole("button", { name: /updating trip/i }),
      ).toBeDefined();
    });

    it("disables all fields during update", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  trip: mockTrip,
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      const nameInput = screen.getByLabelText(/trip name/i);
      expect(nameInput).toHaveProperty("disabled", true);

      const descriptionInput = screen.getByLabelText(/description/i);
      expect(descriptionInput).toHaveProperty("disabled", true);

      const checkbox = screen.getByLabelText(/allow members to add events/i);
      expect(checkbox).toHaveProperty("disabled", true);

      const showAllMembers = screen.getByLabelText(/show all invited members/i);
      expect(showAllMembers).toHaveProperty("disabled", true);
    });

    it("shows error toast on update failure", async () => {
      const { apiRequest, APIError } = await import("@/lib/api");
      vi.mocked(apiRequest).mockRejectedValueOnce(
        new APIError("PERMISSION_DENIED", "Permission denied"),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.stringMatching(/you don't have permission to edit this trip/i),
        );
      });
    });

    it("includes showAllMembers in form submission", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockClear();
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: { ...mockTrip, showAllMembers: true },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      // Toggle showAllMembers on (it starts unchecked since mockTrip.showAllMembers is false)
      const showAllMembersCheckbox = screen.getByRole("checkbox", {
        name: /show all invited members/i,
      });
      await user.click(showAllMembersCheckbox);

      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        const callArgs = vi.mocked(apiRequest).mock.calls[0];
        const body = JSON.parse(callArgs[1]?.body as string);
        expect(body.showAllMembers).toBe(true);
      });
    });
  });

  describe("Delete confirmation flow", () => {
    it("shows delete button", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      expect(
        screen.getByRole("button", { name: /delete trip/i }),
      ).toBeDefined();
    });

    it("shows confirmation dialog when delete is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const deleteButton = screen.getByRole("button", { name: /delete trip/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete this trip/i),
        ).toBeDefined();
      });
    });

    it("shows cancel and confirm buttons in confirmation dialog", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /delete trip/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
        expect(
          screen.getByRole("button", { name: /yes, delete/i }),
        ).toBeDefined();
      });
    });

    it("cancels delete confirmation", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /delete trip/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete this trip/i),
        ).toBeDefined();
      });

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/are you sure you want to delete this trip/i),
        ).toBeNull();
      });
    });

    it("calls delete API when confirmed", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        message: "Trip cancelled successfully",
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /delete trip/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /yes, delete/i }),
        ).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /yes, delete/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips/trip-123",
          expect.objectContaining({
            method: "DELETE",
          }),
        );
      });
    });

    it("shows loading state during delete", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  message: "Trip cancelled successfully",
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /delete trip/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /yes, delete/i }),
        ).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /yes, delete/i }));

      // After confirming delete, the AlertDialog closes and the Delete trip button
      // becomes disabled while the API call is in progress
      await waitFor(() => {
        const deleteButton = screen.getByRole("button", {
          name: /delete trip/i,
        });
        expect(deleteButton).toHaveProperty("disabled", true);
      });
    });

    it("shows error toast on delete failure", async () => {
      const { apiRequest, APIError } = await import("@/lib/api");
      vi.mocked(apiRequest).mockRejectedValueOnce(
        new APIError("PERMISSION_DENIED", "Permission denied"),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /delete trip/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /yes, delete/i }),
        ).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /yes, delete/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.stringMatching(
            /you don't have permission to delete this trip/i,
          ),
        );
      });
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const title = screen.getByText("Edit trip");
      expect(title.className).toContain("font-playfair");
    });

    it("applies gradient styling to Update button", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const updateButton = screen.getByRole("button", {
        name: /update trip/i,
      });
      expect(updateButton.className).toContain("bg-gradient-to-r");
      expect(updateButton.className).toContain("from-primary");
      expect(updateButton.className).toContain("to-accent");
    });
  });

  describe("Description field", () => {
    it("shows character counter at 1600+ characters", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      const longText = "a".repeat(1600);

      await user.click(descriptionInput);
      await user.clear(descriptionInput);
      await user.paste(longText);

      await waitFor(() => {
        expect(screen.getByText("1600 / 2000 characters")).toBeDefined();
      });
    });

    it("does not show character counter below 1600 characters", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      expect(screen.queryByText(/\/ 2000 characters/i)).toBeNull();
    });
  });

  describe("Accessibility", () => {
    it("has proper labels for all form fields", () => {
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      expect(screen.getByLabelText(/trip name/i)).toBeDefined();
      expect(screen.getByLabelText(/destination/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /start date/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /end date/i })).toBeDefined();
      expect(screen.getByLabelText(/trip timezone/i)).toBeDefined();
      expect(screen.getByLabelText(/description/i)).toBeDefined();
      expect(
        screen.getByLabelText(/allow members to add events/i),
      ).toBeDefined();
      expect(screen.getByLabelText(/show all invited members/i)).toBeDefined();
    });

    it("has aria-invalid attribute on invalid fields", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditTripDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          trip={mockTrip}
        />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      await user.clear(nameInput);
      await user.click(screen.getByRole("button", { name: /update trip/i }));

      await waitFor(() => {
        expect(nameInput.getAttribute("aria-invalid")).toBe("true");
      });
    });
  });
});
