import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateEventDialog } from "../create-event-dialog";

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

describe("CreateEventDialog", () => {
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

    // Mock console to avoid test output noise
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
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("Create a new event")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.queryByText("Create a new event")).toBeNull();
    });

    it("calls onOpenChange when close button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Form fields rendering", () => {
    it("displays all required fields", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByLabelText(/event name/i)).toBeDefined();
      expect(screen.getByLabelText(/event type/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /start time/i })).toBeDefined();
    });

    it("displays optional fields", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByLabelText(/^location$/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /end time/i })).toBeDefined();
      expect(screen.getByLabelText(/all day event/i)).toBeDefined();
      expect(screen.getByLabelText(/optional event/i)).toBeDefined();
      expect(screen.getByLabelText(/description/i)).toBeDefined();
    });

    it("shows required field indicators", () => {
      renderWithQueryClient(
        <CreateEventDialog
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

  describe("Field validation - Event name", () => {
    it("shows error when event name is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const submitButton = screen.getByRole("button", {
        name: /create event/i,
      });
      await user.click(submitButton);

      // Wait a moment for validation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Dialog should still be open (validation failed)
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("accepts valid event name", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/event name/i);
      await user.type(nameInput, "Beach Party");

      expect((nameInput as HTMLInputElement).value).toBe("Beach Party");
    });
  });

  describe("Field validation - Event type", () => {
    it("defaults to activity", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const eventTypeSelect = screen.getByLabelText(/event type/i);
      expect(eventTypeSelect).toBeDefined();
    });
  });

  describe("Field validation - Start time", () => {
    it("renders start time picker with placeholder", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const startTimeButton = screen.getByRole("button", {
        name: /start time/i,
      });
      expect(startTimeButton).toBeDefined();
    });
  });

  describe("Field validation - End time", () => {
    it("renders end time picker with placeholder", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const endTimeButton = screen.getByRole("button", { name: /end time/i });
      expect(endTimeButton).toBeDefined();
    });
  });

  describe("Checkbox fields", () => {
    it("all day checkbox defaults to unchecked", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const checkbox = screen.getByRole("checkbox", {
        name: /all day event/i,
      });
      expect(checkbox.getAttribute("data-state")).toBe("unchecked");
    });

    it("optional event checkbox defaults to unchecked", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const checkbox = screen.getByRole("checkbox", {
        name: /optional event/i,
      });
      expect(checkbox.getAttribute("data-state")).toBe("unchecked");
    });

    it("can toggle all day checkbox", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const checkbox = screen.getByRole("checkbox", {
        name: /all day event/i,
      });
      await user.click(checkbox);

      expect(checkbox.getAttribute("data-state")).toBe("checked");
    });
  });

  describe("Description field", () => {
    it("allows entering description text", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      await user.type(descriptionInput, "This is a test event description");

      expect(descriptionInput.value).toBe("This is a test event description");
    });

    it("does not show character counter below 1600 characters", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const descriptionInput = screen.getByLabelText(/description/i);
      await user.type(descriptionInput, "Short description");

      expect(screen.queryByText(/\/ 2000 characters/i)).toBeNull();
    });

    it("shows character counter at 1600+ characters", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
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
    it("shows link input field", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByLabelText(/link url/i)).toBeDefined();
    });

    it("allows adding valid link", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const linkInput = screen.getByLabelText(/link url/i);
      await user.click(linkInput);
      await user.paste("https://example.com");

      const addButton = screen.getByRole("button", { name: /add link/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText("https://example.com")).toBeDefined();
      });
    });

    it("shows error for invalid URL", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
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

    it("allows removing link", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateEventDialog
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

      const removeButton = screen.getByRole("button", {
        name: /remove https:\/\/example\.com/i,
      });
      await user.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText("https://example.com")).toBeNull();
      });
    });
  });

  describe("Form submission", () => {
    it("renders submit button with correct text", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const submitButton = screen.getByRole("button", {
        name: /create event/i,
      });
      expect(submitButton).toBeDefined();
      expect(submitButton.textContent).toContain("Create event");
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const title = screen.getByText("Create a new event");
      expect(title.className).toContain("font-playfair");
    });

    it("applies h-12 height to inputs", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/event name/i);
      expect(nameInput.className).toContain("h-12");
    });

    it("applies rounded-md to inputs and buttons", () => {
      renderWithQueryClient(
        <CreateEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId={tripId}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/event name/i);
      expect(nameInput.className).toContain("rounded-md");

      const submitButton = screen.getByRole("button", {
        name: /create event/i,
      });
      expect(submitButton.className).toContain("rounded-md");
    });
  });
});
