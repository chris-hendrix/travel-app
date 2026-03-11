import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditMemberTravelDialog } from "../edit-member-travel-dialog";
import type { MemberTravel } from "@tripful/shared/types";

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

describe("EditMemberTravelDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockMemberTravel: MemberTravel = {
    id: "member-travel-123",
    tripId: "trip-123",
    memberId: "user-123",
    travelType: "arrival",
    time: new Date("2026-07-15T14:00:00.000Z"),
    location: "Miami Airport",
    details: "Flight AA123",
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
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      expect(screen.getByText("Edit travel details")).toBeDefined();
    });

    it("does not render dialog content when open is false", () => {
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      expect(screen.queryByText("Edit travel details")).toBeNull();
    });
  });

  describe("Form pre-population", () => {
    it("pre-populates form with member travel data", () => {
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      const locationInput = screen.getByLabelText(
        /location/i,
      ) as HTMLInputElement;
      expect(locationInput.value).toBe("Miami Airport");

      const detailsInput = screen.getByRole("textbox", {
        name: /details/i,
      }) as HTMLTextAreaElement;
      expect(detailsInput.value).toBe("Flight AA123");
    });

    it("pre-populates time field", () => {
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      // DateTimePicker button should show formatted date/time in ET (UTC-4 in July)
      const timeButton = screen.getByRole("button", { name: /travel time/i });
      expect(timeButton.textContent).toMatch(/jul 15, 2026/i);
    });

    it("pre-populates travel type", () => {
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      const arrivalRadio = screen.getByRole("radio", { name: /arrival/i });
      expect((arrivalRadio as HTMLInputElement).checked).toBe(true);
    });

    it("pre-populates departure travel type", () => {
      const departureMemberTravel: MemberTravel = {
        ...mockMemberTravel,
        travelType: "departure",
      };

      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={departureMemberTravel}
          timezone="America/New_York"
        />,
      );

      const departureRadio = screen.getByRole("radio", { name: /departure/i });
      expect((departureRadio as HTMLInputElement).checked).toBe(true);
    });
  });

  describe("Form submission", () => {
    it("calls API with updated member travel data", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        memberTravel: {
          ...mockMemberTravel,
          location: "Updated Airport",
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
          onSuccess={mockOnSuccess}
        />,
      );

      const locationInput = screen.getByLabelText(/location/i);
      await user.clear(locationInput);
      await user.type(locationInput, "Updated Airport");

      await user.click(
        screen.getByRole("button", { name: /update travel details/i }),
      );

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          `/member-travel/${mockMemberTravel.id}`,
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
                  memberTravel: mockMemberTravel,
                }),
              100,
            );
          }),
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /update travel details/i }),
      );

      expect(screen.getByRole("button", { name: /updating/i })).toBeDefined();
    });
  });

  describe("Delete functionality", () => {
    it("shows delete button", () => {
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      expect(
        screen.getByRole("button", { name: /delete travel details/i }),
      ).toBeDefined();
    });

    it("shows confirmation dialog when delete button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete travel details/i,
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
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
          onSuccess={mockOnSuccess}
        />,
      );

      const deleteButton = screen.getByRole("button", {
        name: /delete travel details/i,
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
          `/member-travel/${mockMemberTravel.id}`,
          expect.objectContaining({
            method: "DELETE",
          }),
        );
      });
    });
  });

  describe("Field validation", () => {
    it("allows updating all fields", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      const locationInput = screen.getByLabelText(/location/i);
      await user.clear(locationInput);
      await user.type(locationInput, "Updated Location");

      expect((locationInput as HTMLInputElement).value).toBe(
        "Updated Location",
      );
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWithQueryClient(
        <EditMemberTravelDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          memberTravel={mockMemberTravel}
          timezone="America/New_York"
        />,
      );

      const title = screen.getByText("Edit travel details");
      expect(title.className).toContain("font-playfair");
    });
  });
});
