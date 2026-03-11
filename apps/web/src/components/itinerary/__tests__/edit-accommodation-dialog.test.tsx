import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditAccommodationDialog } from "../edit-accommodation-dialog";
import type { Accommodation } from "@tripful/shared/types";

// Mock sonner
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock the API module
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
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

describe("EditAccommodationDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockAccommodation: Accommodation = {
    id: "accommodation-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Test Hotel",
    address: "123 Main St",
    description: "Test description",
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-20T11:00:00.000Z",
    links: ["https://example.com"],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    mockOnOpenChange.mockClear();
    mockOnSuccess.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();

    // Clear the API mock
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockClear();

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

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const renderWithQueryClient = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  describe("Dialog open/close behavior", () => {
    it("renders dialog when open is true", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("Edit accommodation")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      expect(screen.queryByText("Edit accommodation")).toBeNull();
    });
  });

  describe("Form pre-population", () => {
    it("pre-populates form with accommodation data", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(
        /accommodation name/i,
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("Test Hotel");

      const addressInput = screen.getByLabelText(
        /address/i,
      ) as HTMLInputElement;
      expect(addressInput.value).toBe("123 Main St");

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      expect(descriptionInput.value).toBe("Test description");
    });

    it("pre-populates date fields", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      // DateTimePicker buttons should be present and display formatted datetime
      const checkInButton = screen.getByRole("button", {
        name: /check-in/i,
      });
      expect(checkInButton).toBeDefined();
      // Verify pre-populated date is displayed (Jul 15, 2026 in America/New_York)
      expect(checkInButton.textContent).toMatch(/jul 15, 2026/i);

      const checkOutButton = screen.getByRole("button", {
        name: /check-out/i,
      });
      expect(checkOutButton).toBeDefined();
      // Verify pre-populated date is displayed (Jul 20, 2026 in America/New_York)
      expect(checkOutButton.textContent).toMatch(/jul 20, 2026/i);
    });

    it("pre-populates links", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("https://example.com")).toBeDefined();
    });
  });

  describe("Form submission", () => {
    it("calls API with updated accommodation data", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        accommodation: {
          ...mockAccommodation,
          name: "Updated Hotel",
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
          onSuccess={mockOnSuccess}
        />,
      );

      const nameInput = screen.getByLabelText(/accommodation name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Hotel");

      await user.click(
        screen.getByRole("button", { name: /update accommodation/i }),
      );

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          `/accommodations/${mockAccommodation.id}`,
          expect.objectContaining({
            method: "PUT",
          }),
        );
      });
    });

    it("shows loading state during update", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  accommodation: mockAccommodation,
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /update accommodation/i }),
      );

      expect(screen.getByRole("button", { name: /updating/i })).toBeDefined();
    });
  });

  describe("Delete functionality", () => {
    it("shows delete button", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      expect(
        screen.getByRole("button", { name: /delete accommodation/i }),
      ).toBeDefined();
    });

    it("shows confirmation dialog when delete button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete accommodation/i,
      });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText("Are you sure?")).toBeDefined();
      });
    });

    it("calls delete API when confirmed", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({});

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
          onSuccess={mockOnSuccess}
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete accommodation/i,
      });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText("Are you sure?")).toBeDefined();
      });

      const confirmButton = screen.getByRole("button", {
        name: /yes, delete/i,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          `/accommodations/${mockAccommodation.id}`,
          expect.objectContaining({
            method: "DELETE",
          }),
        );
      });
    });
  });

  describe("Field validation", () => {
    it("shows error when name is cleared", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/accommodation name/i);
      await user.clear(nameInput);

      await user.click(
        screen.getByRole("button", { name: /update accommodation/i }),
      );

      // Wait a moment for validation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Dialog should still be open (validation failed)
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <EditAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          accommodation={mockAccommodation}
          timezone="America/New_York"
        />,
      );

      const title = screen.getByText("Edit accommodation");
      expect(title.className).toContain("font-playfair");
    });
  });
});
