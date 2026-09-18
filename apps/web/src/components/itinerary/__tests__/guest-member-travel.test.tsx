import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateMemberTravelDialog } from "../create-member-travel-dialog";
import { MemberTravelLineItem } from "../member-travel-line-item";
import { canModifyMemberTravel } from "../utils/permissions";
import type { MemberTravel } from "@journiful/shared/types";

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

const mockApiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  apiRequest: mockApiRequest,
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

const mockUser = vi.hoisted(() => ({
  id: "user-1",
  displayName: "Liam",
  phoneNumber: "+15551234567",
}));
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Organizer + regular member + guest (userId null)
const mockMembers = vi.hoisted(() => [
  {
    id: "member-1",
    userId: "user-1",
    displayName: "Liam",
    profilePhotoUrl: null,
    handles: null,
    isOrganizer: true,
    status: "going" as const,
    createdAt: "2026-01-01",
  },
  {
    id: "member-2",
    userId: "user-2",
    displayName: "Sarah Chen",
    profilePhotoUrl: null,
    handles: null,
    isOrganizer: false,
    status: "going" as const,
    createdAt: "2026-01-01",
  },
  {
    id: "member-guest",
    userId: null,
    displayName: "Mom",
    profilePhotoUrl: null,
    handles: null,
    isOrganizer: false,
    status: "no_response" as const,
    createdAt: "2026-01-01",
  },
]);
vi.mock("@/hooks/use-invitations", () => ({
  useMembers: () => ({ data: mockMembers }),
}));

function guestTravel(): MemberTravel {
  return {
    id: "travel-guest",
    tripId: "trip-1",
    memberId: "member-guest",
    travelType: "arrival",
    arrivalTime: new Date("2026-09-11T15:20:00Z"),
    arrivalLocation: "Naples Airport (NAP)",
    details: null,
    flightNumber: "DL 443",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    memberName: "Mom",
  };
}

// Radix Select uses pointer capture, which jsdom lacks.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
}

describe("guest member travel (Task 7.2)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const renderWithQueryClient = (ui: React.ReactElement) =>
    render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );

  describe("canModifyMemberTravel — memberId ownership", () => {
    it("organizer can edit guest travel", () => {
      expect(
        canModifyMemberTravel(guestTravel(), "user-1", true, false, "member-1"),
      ).toBe(true);
    });

    it("non-organizer cannot edit guest travel (guest rows are organizer-only)", () => {
      expect(
        canModifyMemberTravel(
          guestTravel(),
          "user-2",
          false,
          false,
          "member-2",
        ),
      ).toBe(false);
    });

    it("non-organizer can edit their own travel via memberId", () => {
      const own: MemberTravel = { ...guestTravel(), memberId: "member-2" };
      expect(
        canModifyMemberTravel(own, "user-2", false, false, "member-2"),
      ).toBe(true);
    });

    it("locked trip blocks even organizers", () => {
      expect(
        canModifyMemberTravel(guestTravel(), "user-1", true, true, "member-1"),
      ).toBe(false);
    });
  });

  describe("guest travel renders in itinerary list", () => {
    it("renders guest travel row with guest name", () => {
      renderWithQueryClient(
        <MemberTravelLineItem
          memberTravel={guestTravel()}
          memberName="Mom"
          timezone="America/New_York"
          onClick={() => {}}
        />,
      );
      expect(screen.getByText("Mom")).toBeInTheDocument();
    });
  });

  describe("organizer travel dialog — guest options", () => {
    it("guest option shows Guest badge without (You); self keeps (You)", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateMemberTravelDialog
          open={true}
          onOpenChange={() => {}}
          tripId="trip-1"
          timezone="America/New_York"
          isOrganizer={true}
        />,
      );

      const selector = screen.getByTestId("member-selector");
      await user.click(selector);

      const selfOption = await screen.findByRole("option", {
        name: /Liam.*\(You\)/,
      });
      expect(selfOption).toBeInTheDocument();
      expect(selfOption).toHaveTextContent("(You)");

      const guestOption = await screen.findByRole("option", {
        name: /Mom.*Guest/,
      });
      expect(guestOption).toBeInTheDocument();
      expect(guestOption).toHaveTextContent("Mom");
      expect(guestOption).toHaveTextContent("Guest");
      expect(guestOption).not.toHaveTextContent("(You)");
    });

    it("selecting a guest updates the title and shows the organizer-plans hint", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <CreateMemberTravelDialog
          open={true}
          onOpenChange={() => {}}
          tripId="trip-1"
          timezone="America/New_York"
          isOrganizer={true}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Add your travel details" }),
      ).toBeInTheDocument();

      await user.click(screen.getByTestId("member-selector"));
      const guestOption = await screen.findByRole("option", {
        name: /Mom.*Guest/,
      });
      await user.click(guestOption);

      expect(
        await screen.findByRole("heading", { name: "Add travel for Mom" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/has no app access/i),
      ).toBeInTheDocument();
    });
  });
});
