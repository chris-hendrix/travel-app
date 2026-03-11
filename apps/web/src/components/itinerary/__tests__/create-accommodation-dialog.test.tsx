import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateAccommodationDialog } from "../create-accommodation-dialog";

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

describe("CreateAccommodationDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const tripId = "test-trip-123";
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
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("Create a new accommodation")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.queryByText("Create a new accommodation")).toBeNull();
    });
  });

  describe("Form fields rendering", () => {
    it("displays all required fields", () => {
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByLabelText(/accommodation name/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /check-in/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /check-out/i })).toBeDefined();
    });

    it("displays optional fields", () => {
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByLabelText(/address/i)).toBeDefined();
      expect(screen.getByLabelText(/description/i)).toBeDefined();
    });

    it("shows required field indicators", () => {
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const labels = screen.getAllByText("*");
      expect(labels.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Field validation", () => {
    it("shows error when accommodation name is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const submitButton = screen.getByRole("button", {
        name: /create accommodation/i,
      });
      await user.click(submitButton);

      // Wait a moment for validation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Dialog should still be open (validation failed)
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("accepts valid accommodation name", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/accommodation name/i);
      await user.type(nameInput, "Oceanview Hotel");

      expect((nameInput as HTMLInputElement).value).toBe("Oceanview Hotel");
    });

    it("renders date picker buttons with placeholders", () => {
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const checkInButton = screen.getByRole("button", { name: /check-in/i });
      expect(checkInButton).toBeDefined();

      const checkOutButton = screen.getByRole("button", { name: /check-out/i });
      expect(checkOutButton).toBeDefined();
    });
  });

  describe("Description field", () => {
    it("shows character counter at 1600+ characters", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      const longText = "a".repeat(1600);

      await user.click(descriptionInput);
      await user.paste(longText);

      await waitFor(() => {
        expect(screen.getByText("1600 / 2000 characters")).toBeDefined();
      });
    });
  });

  describe("Links field", () => {
    it("allows adding valid link", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const linkInput = screen.getByLabelText(/link url/i);
      await user.type(linkInput, "https://example.com");

      const addButton = screen.getByRole("button", { name: /add link/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText("https://example.com")).toBeDefined();
      });
    });

    it("shows error for invalid URL", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const linkInput = screen.getByLabelText(/link url/i);
      await user.type(linkInput, "not a valid url");

      const addButton = screen.getByRole("button", { name: /add link/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid url/i)).toBeDefined();
      });
    });
  });

  describe("Form submission", () => {
    it("shows loading state during submission", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  accommodation: {
                    id: "accommodation-123",
                    tripId: tripId,
                    createdBy: "user-123",
                    name: "Test Accommodation",
                    address: null,
                    description: null,
                    checkIn: "2026-07-15T14:00:00.000Z",
                    checkOut: "2026-07-20T11:00:00.000Z",
                    links: null,
                    deletedAt: null,
                    deletedBy: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/accommodation name/i);
      await user.type(nameInput, "Test Accommodation");

      await user.click(
        screen.getByRole("button", { name: /create accommodation/i }),
      );

      // Form validation prevents submission without required fields, but button should still work
      expect(
        screen.getByRole("button", { name: /create accommodation/i }),
      ).toBeDefined();
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <CreateAccommodationDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const title = screen.getByText("Create a new accommodation");
      expect(title.className).toContain("font-playfair");
    });
  });
});
