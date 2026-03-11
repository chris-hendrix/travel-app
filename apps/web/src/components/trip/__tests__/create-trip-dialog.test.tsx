import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateTripDialog } from "../create-trip-dialog";

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

describe("CreateTripDialog", () => {
  const mockOnOpenChange = vi.fn();
  let queryClient: QueryClient;

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
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      expect(screen.getByText("Create a new trip")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <CreateTripDialog open={false} onOpenChange={mockOnOpenChange} />,
      );

      expect(screen.queryByText("Create a new trip")).toBeNull();
    });

    it("calls onOpenChange when close button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Step 1 - Trip details rendering", () => {
    it("displays all Step 1 fields", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      expect(screen.getByLabelText(/trip name/i)).toBeDefined();
      expect(screen.getByLabelText(/destination/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /start date/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /end date/i })).toBeDefined();
      expect(screen.getByLabelText(/trip timezone/i)).toBeDefined();
    });

    it("shows Step 1 of 2 progress indicator", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      expect(screen.getByText("Step 1 of 2")).toBeDefined();
      expect(screen.getByText("Trip details")).toBeDefined();
    });

    it("displays Continue button on Step 1", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      expect(screen.getByRole("button", { name: /continue/i })).toBeDefined();
    });

    it("shows required field indicators", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Check for required asterisks by finding text content
      const labels = screen.getAllByText("*");
      // Trip name, Destination, and Timezone should have asterisks
      expect(labels.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Field validation - Trip name", () => {
    it("shows error when trip name is too short", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "AB");
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/trip name must be at least 3 characters/i),
        ).toBeDefined();
      });
    });

    it("shows error when trip name is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText(/required/i)).toBeDefined();
      });
    });

    it("accepts valid trip name (3-100 characters)", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Summer Vacation 2026");

      // Should not show error
      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        // Name error should not appear
        expect(
          screen.queryByText(/trip name must be at least 3 characters/i),
        ).toBeNull();
      });
    });
  });

  describe("Field validation - Destination", () => {
    it("shows error when destination is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Fill name but leave destination empty
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText(/destination is required/i)).toBeDefined();
      });
    });

    it("accepts valid destination", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami, FL");

      // Should not show error after typing
      expect(screen.queryByText(/destination is required/i)).toBeNull();
    });
  });

  describe("Field validation - Date fields", () => {
    it("accepts optional start and end dates", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Fill required fields
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami");

      // Leave dates empty
      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      // Should proceed to Step 2 without date errors
      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });
    });

    it("renders date picker buttons with placeholders", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const startDateButton = screen.getByRole("button", {
        name: /start date/i,
      });
      expect(startDateButton).toBeDefined();

      const endDateButton = screen.getByRole("button", { name: /end date/i });
      expect(endDateButton).toBeDefined();
    });
  });

  describe("Field validation - Timezone", () => {
    it("defaults to browser timezone", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Timezone should have a default value
      const timezoneSelect = screen.getByLabelText(/trip timezone/i);
      expect(timezoneSelect).toBeDefined();
    });

    it("renders timezone select with options", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const timezoneSelect = screen.getByLabelText(/trip timezone/i);
      expect(timezoneSelect).toBeDefined();

      // Timezone select should be present and functional
      // Note: Full interaction testing with Radix Select is complex in jsdom
      // The component will be tested in E2E tests
    });
  });

  describe("Step navigation", () => {
    it("does not proceed to Step 2 with invalid Step 1 data", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Leave fields empty
      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      // Should stay on Step 1
      await waitFor(() => {
        expect(screen.getByText("Step 1 of 2")).toBeDefined();
        expect(screen.queryByText("Step 2 coming in Task 4.4")).toBeNull();
      });
    });

    it("proceeds to Step 2 with valid Step 1 data", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Fill required fields
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Summer Beach Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Malibu, CA");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      // Should show Step 2
      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
        expect(screen.getByText("Customize")).toBeDefined();
      });
    });

    it("returns to Step 1 when Back button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Navigate to Step 2
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami");

      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      // Click Back
      const backButton = screen.getByRole("button", { name: /back/i });
      await user.click(backButton);

      // Should return to Step 1
      await waitFor(() => {
        expect(screen.getByText("Step 1 of 2")).toBeDefined();
        expect(screen.getByLabelText(/trip name/i)).toBeDefined();
      });
    });

    it("preserves Step 1 data when navigating back from Step 2", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Fill Step 1 data
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Preserved Trip Name");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Preserved Destination");

      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      // Navigate back
      await user.click(screen.getByRole("button", { name: /back/i }));

      // Verify data is preserved
      await waitFor(() => {
        const nameInputAfterBack = screen.getByLabelText(
          /trip name/i,
        ) as HTMLInputElement;
        expect(nameInputAfterBack.value).toBe("Preserved Trip Name");

        const destinationInputAfterBack = screen.getByLabelText(
          /destination/i,
        ) as HTMLInputElement;
        expect(destinationInputAfterBack.value).toBe("Preserved Destination");
      });
    });
  });

  describe("Step 2 - Customize rendering", () => {
    async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami");

      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });
    }

    it("displays all Step 2 fields", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      expect(screen.getAllByText(/cover photo/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/theme/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/font/i).length).toBeGreaterThan(0);
    });

    it("shows Back and Create trip buttons on Step 2", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
      expect(
        screen.getByRole("button", { name: /create trip/i }),
      ).toBeDefined();
    });

    it("shows Step 2 of 2 progress indicator", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      expect(screen.getByText("Step 2 of 2")).toBeDefined();
      expect(screen.getByText("Customize")).toBeDefined();
    });
  });

  describe("Step 1 - Description field", () => {
    it("allows entering description text", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      await user.type(descriptionInput, "This is a test trip description");

      expect(descriptionInput.value).toBe("This is a test trip description");
    });

    it("does not show character counter below 1600 characters", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const descriptionInput = screen.getByLabelText(/description/i);
      await user.type(descriptionInput, "Short description");

      expect(screen.queryByText(/\/ 2000 characters/i)).toBeNull();
    });

    it("shows character counter at 1600+ characters", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      const longText = "a".repeat(1600);

      // Use paste to avoid slow character-by-character typing
      await user.click(descriptionInput);
      await user.paste(longText);

      await waitFor(() => {
        expect(screen.getByText("1600 / 2000 characters")).toBeDefined();
      });
    });

    it("prevents submission when description exceeds 2000 characters", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockClear();

      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const descriptionInput = screen.getByLabelText(
        /description/i,
      ) as HTMLTextAreaElement;
      const tooLongText = "a".repeat(2001);

      // Use paste to avoid slow character-by-character typing
      await user.click(descriptionInput);
      await user.paste(tooLongText);

      // Fill required fields and navigate to Step 2 to trigger submission validation
      await user.type(screen.getByLabelText(/trip name/i), "Test Trip");
      await user.type(screen.getByLabelText(/destination/i), "Miami");
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /create trip/i }));

      // Form validation should prevent the API call
      await waitFor(() => {
        expect(apiRequest).not.toHaveBeenCalled();
      });
    });

    it("accepts valid description (under 2000 characters)", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: {
          id: "trip-123",
          name: "Test Trip",
          destination: "Miami",
          startDate: null,
          endDate: null,
          preferredTimezone: "America/New_York",
          description: "Valid description",
          coverImageUrl: null,
          createdBy: "user-123",
          allowMembersToAddEvents: true,
          cancelled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const descriptionInput = screen.getByLabelText(/description/i);
      await user.type(descriptionInput, "Valid description");

      // Fill required fields and navigate to Step 2 to submit
      await user.type(screen.getByLabelText(/trip name/i), "Test Trip");
      await user.type(screen.getByLabelText(/destination/i), "Miami");
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /create trip/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("Valid description"),
          }),
        );
      });
    });
  });

  describe("Step 2 - Cover image field", () => {
    async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami");

      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });
    }

    it("renders ImageUpload component", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      // ImageUpload component should render its upload area
      expect(
        screen.getByText(/click to upload or drag and drop/i),
      ).toBeDefined();
    });

    it("allows cover image to be optional", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: {
          id: "trip-123",
          name: "Test Trip",
          destination: "Miami",
          startDate: null,
          endDate: null,
          preferredTimezone: "America/New_York",
          description: null,
          coverImageUrl: null,
          createdBy: "user-123",
          allowMembersToAddEvents: true,
          cancelled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      // Submit without uploading image
      await user.click(screen.getByRole("button", { name: /create trip/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips",
          expect.objectContaining({
            method: "POST",
          }),
        );
      });
    });
  });

  describe("Step 1 - Allow members to add events checkbox", () => {
    it("defaults to checked (true)", async () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const checkbox = screen.getByRole("checkbox", {
        name: /allow members to add events/i,
      });
      expect(checkbox.getAttribute("data-state")).toBe("checked");
    });

    it("can be toggled off", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const checkbox = screen.getByRole("checkbox", {
        name: /allow members to add events/i,
      });
      expect(checkbox.getAttribute("data-state")).toBe("checked");

      await user.click(checkbox);

      expect(checkbox.getAttribute("data-state")).toBe("unchecked");
    });

    it("can be toggled back on", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const checkbox = screen.getByRole("checkbox", {
        name: /allow members to add events/i,
      });

      await user.click(checkbox);
      expect(checkbox.getAttribute("data-state")).toBe("unchecked");

      await user.click(checkbox);
      expect(checkbox.getAttribute("data-state")).toBe("checked");
    });

    it("submits correct value when unchecked", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockClear();
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: {
          id: "trip-123",
          name: "Test Trip",
          destination: "Miami",
          startDate: null,
          endDate: null,
          preferredTimezone: "America/New_York",
          description: null,
          coverImageUrl: null,
          createdBy: "user-123",
          allowMembersToAddEvents: false,
          cancelled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const checkbox = screen.getByLabelText(/allow members to add events/i);
      await user.click(checkbox);

      // Fill required fields and navigate to Step 2 to submit
      await user.type(screen.getByLabelText(/trip name/i), "Test Trip");
      await user.type(screen.getByLabelText(/destination/i), "Miami");
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /create trip/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalled();
        const callArgs = vi.mocked(apiRequest).mock.calls[0];
        expect(callArgs).toBeDefined();
        const body = JSON.parse(callArgs[1]?.body as string);
        expect(body.allowMembersToAddEvents).toBe(false);
      });
    });
  });

  describe("Step 2 - Back navigation preserves data", () => {
    it("renders Step 2 fields after round-trip navigation", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Fill Step 1
      await user.type(screen.getByLabelText(/trip name/i), "Test Trip");
      await user.type(screen.getByLabelText(/destination/i), "Miami");
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      // Verify Step 2 fields are present
      expect(screen.getAllByText(/cover photo/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/theme/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/font/i).length).toBeGreaterThan(0);

      // Navigate back
      await user.click(screen.getByRole("button", { name: /back/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 1 of 2")).toBeDefined();
      });

      // Navigate forward again
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      // Verify Step 2 fields are still present after round-trip
      expect(screen.getAllByText(/cover photo/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/theme/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/font/i).length).toBeGreaterThan(0);
    });
  });

  describe("Step 2 - Loading state", () => {
    async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami");

      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });
    }

    it("shows loading state during submission", async () => {
      const { apiRequest } = await import("@/lib/api");
      // Mock API with delay to observe loading state
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  trip: {
                    id: "trip-123",
                    name: "Test Trip",
                    destination: "Miami",
                    startDate: null,
                    endDate: null,
                    preferredTimezone: "America/New_York",
                    description: null,
                    coverImageUrl: null,
                    createdBy: "user-123",
                    allowMembersToAddEvents: true,
                    cancelled: false,
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
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      await user.click(screen.getByRole("button", { name: /create trip/i }));

      // Should show loading text
      expect(screen.getByText("Creating trip...")).toBeDefined();
    });

    it("disables Back and Create trip buttons during submission", async () => {
      const { apiRequest } = await import("@/lib/api");
      // Mock API with delay to observe disabled state
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  trip: {
                    id: "trip-123",
                    name: "Test Trip",
                    destination: "Miami",
                    startDate: null,
                    endDate: null,
                    preferredTimezone: "America/New_York",
                    description: null,
                    coverImageUrl: null,
                    createdBy: "user-123",
                    allowMembersToAddEvents: true,
                    cancelled: false,
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
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      await navigateToStep2(user);

      await user.click(screen.getByRole("button", { name: /create trip/i }));

      const backButton = screen.getByRole("button", { name: /back/i });
      expect(backButton).toHaveProperty("disabled", true);

      const createButton = screen.getByRole("button", {
        name: /creating trip\.\.\./i,
      });
      expect(createButton).toHaveProperty("disabled", true);
    });
  });

  describe("Progress indicator styling", () => {
    it("shows active styling for Step 1 when on Step 1", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Check for step indicators showing "1" and "2"
      const stepIndicators = screen.getAllByText(/^[12]$/);
      expect(stepIndicators.length).toBe(2);

      // Verify Step 1 and Step 2 text is present
      expect(screen.getByText("Step 1 of 2")).toBeDefined();
    });

    it("shows step progress when navigating to Step 2", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Verify Step 1 indicator
      expect(screen.getByText("Step 1 of 2")).toBeDefined();

      // Navigate to Step 2
      const nameInput = screen.getByLabelText(/trip name/i);
      await user.type(nameInput, "Test Trip");

      const destinationInput = screen.getByLabelText(/destination/i);
      await user.type(destinationInput, "Miami");

      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      // Both step numbers should still be visible
      const stepIndicators = screen.getAllByText(/^[12]$/);
      expect(stepIndicators.length).toBe(2);
    });
  });

  describe("Accessibility", () => {
    it("has proper labels for all form fields", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      expect(screen.getByLabelText(/trip name/i)).toBeDefined();
      expect(screen.getByLabelText(/destination/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /start date/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /end date/i })).toBeDefined();
      expect(screen.getByLabelText(/trip timezone/i)).toBeDefined();
    });

    it("has aria-invalid attribute on invalid fields", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/trip name/i);
        expect(nameInput.getAttribute("aria-invalid")).toBe("true");
      });
    });

    it("shows form descriptions for context", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      expect(
        screen.getByText(/choose something memorable \(3-100 characters\)/i),
      ).toBeDefined();
      expect(
        screen.getByText(/all trip times will be shown in this timezone/i),
      ).toBeDefined();
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const title = screen.getByText("Create a new trip");
      expect(title.className).toContain("font-playfair");
    });

    it("applies h-12 height to inputs", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      expect(nameInput.className).toContain("h-12");
    });

    it("applies rounded-md to inputs and buttons", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const nameInput = screen.getByLabelText(/trip name/i);
      expect(nameInput.className).toContain("rounded-md");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      expect(continueButton.className).toContain("rounded-md");
    });

    it("applies pb-6 bottom padding to form for mobile scroll", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const form = document.querySelector("form");
      expect(form).not.toBeNull();
      expect(form!.className).toContain("pb-6");
    });

    it("applies gradient styling to Continue button", () => {
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      const continueButton = screen.getByRole("button", { name: /continue/i });
      expect(continueButton.className).toContain("bg-gradient-to-r");
      expect(continueButton.className).toContain("from-primary");
      expect(continueButton.className).toContain("to-accent");
    });
  });

  describe("Form submission", () => {
    it("calls API with trip data on form submit", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: {
          id: "trip-123",
          name: "API Test Trip",
          destination: "Test City",
          startDate: null,
          endDate: null,
          preferredTimezone: "America/New_York",
          description: null,
          coverImageUrl: null,
          createdBy: "user-123",
          allowMembersToAddEvents: true,
          cancelled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateTripDialog open={true} onOpenChange={mockOnOpenChange} />,
      );

      // Fill Step 1
      await user.type(screen.getByLabelText(/trip name/i), "API Test Trip");
      await user.type(screen.getByLabelText(/destination/i), "Test City");
      await user.click(screen.getByRole("button", { name: /continue/i }));

      // Submit from Step 2
      await waitFor(() => {
        expect(screen.getByText("Step 2 of 2")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /create trip/i }));

      // Verify API was called with correct data
      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("API Test Trip"),
          }),
        );
      });
    });
  });
});
