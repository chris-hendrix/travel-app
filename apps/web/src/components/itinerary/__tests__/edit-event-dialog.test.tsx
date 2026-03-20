import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditEventDialog } from "../edit-event-dialog";
import type { Event } from "@journiful/shared/types";

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

describe("EditEventDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Test Event",
    description: "Test description",
    eventType: "activity",
    location: "Test Location",
    meetupLocation: null,
    meetupTime: null,
    startTime: new Date("2026-07-15T14:00:00.000Z"),
    endTime: new Date("2026-07-15T16:00:00.000Z"),
    allDay: false,
    isOptional: false,
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
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("Edit event")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      expect(screen.queryByText("Edit event")).toBeNull();
    });
  });

  describe("Form pre-population", () => {
    it("pre-populates form with event data", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(
        /event name/i,
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("Test Event");

      const locationInput = screen.getByLabelText(
        /^location$/i,
      ) as HTMLInputElement;
      expect(locationInput.value).toBe("Test Location");

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      expect(descriptionInput.value).toBe("Test description");
    });

    it("pre-populates datetime fields", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      // DateTimePicker buttons should show formatted date/time, not placeholder
      const startTimeButton = screen.getByRole("button", {
        name: /start time/i,
      });
      expect(startTimeButton.textContent).toMatch(/jul 15, 2026/i);
    });

    it("pre-populates links", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("https://example.com")).toBeDefined();
    });

    it("pre-populates checkbox fields", () => {
      const eventWithOptions: Event = {
        ...mockEvent,
        allDay: true,
        isOptional: true,
      };

      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={eventWithOptions}
          timezone="America/New_York"
        />,
      );

      const allDayCheckbox = screen.getByRole("checkbox", {
        name: /all day event/i,
      });
      expect(allDayCheckbox.getAttribute("data-state")).toBe("checked");

      const optionalCheckbox = screen.getByRole("checkbox", {
        name: /optional event/i,
      });
      expect(optionalCheckbox.getAttribute("data-state")).toBe("checked");
    });
  });

  describe("Form submission", () => {
    it("calls API with updated event data", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        event: {
          ...mockEvent,
          name: "Updated Event",
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          onSuccess={mockOnSuccess}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/event name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Event");

      await user.click(screen.getByRole("button", { name: /update event/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          `/events/${mockEvent.id}`,
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
                  event: mockEvent,
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      await user.click(screen.getByRole("button", { name: /update event/i }));

      expect(screen.getByRole("button", { name: /updating/i })).toBeDefined();
    });
  });

  describe("Delete functionality", () => {
    it("shows delete button", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      expect(
        screen.getByRole("button", { name: /delete event/i }),
      ).toBeDefined();
    });

    it("shows confirmation dialog when delete button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete event/i,
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
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          onSuccess={mockOnSuccess}
          timezone="America/New_York"
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete event/i,
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
          `/events/${mockEvent.id}`,
          expect.objectContaining({
            method: "DELETE",
          }),
        );
      });
    });

    it("does not delete when cancelled", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockClear();

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete event/i,
      });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText("Are you sure?")).toBeDefined();
      });

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(apiRequest).not.toHaveBeenCalled();
      });
    });
  });

  describe("Field validation", () => {
    it("shows error when name is cleared", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/event name/i);
      await user.clear(nameInput);

      await user.click(screen.getByRole("button", { name: /update event/i }));

      // Wait a moment for validation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Dialog should still be open (validation failed)
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("allows updating all fields", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const nameInput = screen.getByLabelText(/event name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Event");

      const locationInput = screen.getByLabelText(/^location$/i);
      await user.clear(locationInput);
      await user.type(locationInput, "Updated Location");

      expect((nameInput as HTMLInputElement).value).toBe("Updated Event");
      expect((locationInput as HTMLInputElement).value).toBe(
        "Updated Location",
      );
    });
  });

  describe("Links management", () => {
    it("allows adding new links", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const linkInput = screen.getByLabelText(/link url/i);
      await user.click(linkInput);
      await user.paste("https://newlink.com");

      const addButton = screen.getByRole("button", { name: "" });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText("https://newlink.com")).toBeDefined();
      });
    });

    it("allows removing existing links", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const removeButton = screen.getByRole("button", {
        name: /remove https:\/\/example\.com/i,
      });
      await user.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText("https://example.com")).toBeNull();
      });
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const title = screen.getByText("Edit event");
      expect(title.className).toContain("font-playfair");
    });

    it("applies rounded-md to buttons", () => {
      renderWithQueryClient(
        <EditEventDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          event={mockEvent}
          timezone="America/New_York"
        />,
      );

      const submitButton = screen.getByRole("button", {
        name: /update event/i,
      });
      expect(submitButton.className).toContain("rounded-md");
    });
  });
});
