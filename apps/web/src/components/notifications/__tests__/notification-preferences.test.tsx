import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mocks
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

const mockUseNotificationPreferences = vi.fn();
const mockUpdatePreferencesMutate = vi.fn();

vi.mock("@/hooks/use-notifications", () => ({
  useNotificationPreferences: (tripId: string) =>
    mockUseNotificationPreferences(tripId),
  useUpdateNotificationPreferences: () => ({
    mutate: mockUpdatePreferencesMutate,
    isPending: false,
  }),
  getUpdatePreferencesErrorMessage: (error: Error | null) => {
    if (!error) return null;
    return error.message || "Failed to update preferences";
  },
}));

const mockUseMySettings = vi.fn();
const mockUpdateMySettingsMutate = vi.fn();

vi.mock("@/hooks/use-calendar", () => ({
  useCalendarStatus: () => ({ data: null, isLoading: false }),
  useUpdateTripCalendarExclusion: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-invitations", () => ({
  useMySettings: (tripId: string) => mockUseMySettings(tripId),
  useUpdateMySettings: () => ({
    mutate: mockUpdateMySettingsMutate,
    isPending: false,
  }),
  getUpdateMySettingsErrorMessage: (error: Error | null) => {
    if (!error) return null;
    return error.message || "Failed to update privacy settings";
  },
}));

import { NotificationPreferences } from "../notification-preferences";

describe("NotificationPreferences", () => {
  const defaultPrefs = {
    dailyItinerary: true,
    tripMessages: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotificationPreferences.mockReturnValue({
      data: defaultPrefs,
      isLoading: false,
    });
    mockUseMySettings.mockReturnValue({
      data: false,
      isLoading: false,
    });
  });

  it("renders two preference toggles", () => {
    render(<NotificationPreferences tripId="trip-1" />);

    expect(screen.getByText("Daily Itinerary")).toBeDefined();
    expect(screen.getByText("Trip Messages")).toBeDefined();
  });

  it("renders preference descriptions", () => {
    render(<NotificationPreferences tripId="trip-1" />);

    expect(
      screen.getByText("Receive a summary of the day's events at 8am"),
    ).toBeDefined();
    expect(
      screen.getByText("Get notified when someone posts a new message"),
    ).toBeDefined();
  });

  it("renders SMS footer note", () => {
    render(<NotificationPreferences tripId="trip-1" />);

    expect(
      screen.getByText(
        "Notifications are sent in-app and via SMS to your phone number.",
      ),
    ).toBeDefined();
  });

  it("shows loading skeletons when loading", () => {
    mockUseNotificationPreferences.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = render(<NotificationPreferences tripId="trip-1" />);

    // Should show skeleton elements, not the preference labels
    expect(screen.queryByText("Daily Itinerary")).toBeNull();

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("passes tripId to useNotificationPreferences", () => {
    render(<NotificationPreferences tripId="trip-abc" />);
    expect(mockUseNotificationPreferences).toHaveBeenCalledWith("trip-abc");
  });

  it("renders switches with correct checked state", () => {
    mockUseNotificationPreferences.mockReturnValue({
      data: {
        dailyItinerary: false,
        tripMessages: true,
      },
      isLoading: false,
    });

    render(<NotificationPreferences tripId="trip-1" />);

    const dailySwitch = screen.getByRole("switch", {
      name: "Daily Itinerary",
    });
    const messagesSwitch = screen.getByRole("switch", {
      name: "Trip Messages",
    });

    expect(dailySwitch.getAttribute("data-state")).toBe("unchecked");
    expect(messagesSwitch.getAttribute("data-state")).toBe("checked");
  });

  it("calls updatePreferences with all fields when toggling dailyItinerary", async () => {
    const user = userEvent.setup();

    render(<NotificationPreferences tripId="trip-1" />);

    const dailySwitch = screen.getByRole("switch", {
      name: "Daily Itinerary",
    });
    await user.click(dailySwitch);

    expect(mockUpdatePreferencesMutate).toHaveBeenCalledWith(
      {
        dailyItinerary: false,
        tripMessages: true,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("calls updatePreferences with all fields when toggling tripMessages", async () => {
    const user = userEvent.setup();

    render(<NotificationPreferences tripId="trip-1" />);

    const messagesSwitch = screen.getByRole("switch", {
      name: "Trip Messages",
    });
    await user.click(messagesSwitch);

    expect(mockUpdatePreferencesMutate).toHaveBeenCalledWith(
      {
        dailyItinerary: true,
        tripMessages: false,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("shows success toast when mutation succeeds", async () => {
    const user = userEvent.setup();
    mockUpdatePreferencesMutate.mockImplementation(
      (
        _data: unknown,
        options: { onSuccess: () => void; onError: (error: Error) => void },
      ) => {
        options.onSuccess();
      },
    );

    render(<NotificationPreferences tripId="trip-1" />);

    const dailySwitch = screen.getByRole("switch", {
      name: "Daily Itinerary",
    });
    await user.click(dailySwitch);

    expect(mockToast.success).toHaveBeenCalledWith("Preferences updated");
  });

  it("shows toast error when mutation fails", async () => {
    const user = userEvent.setup();
    mockUpdatePreferencesMutate.mockImplementation(
      (_data: unknown, options: { onError: (error: Error) => void }) => {
        options.onError(new Error("Server error"));
      },
    );

    render(<NotificationPreferences tripId="trip-1" />);

    const dailySwitch = screen.getByRole("switch", {
      name: "Daily Itinerary",
    });
    await user.click(dailySwitch);

    expect(mockToast.error).toHaveBeenCalledWith("Server error");
  });

  it("renders Privacy section with share phone toggle", () => {
    render(<NotificationPreferences tripId="trip-1" />);

    expect(screen.getByText("Privacy")).toBeDefined();
    expect(screen.getByText("Share phone number")).toBeDefined();
    expect(
      screen.getByText("Allow other trip members to see your phone number"),
    ).toBeDefined();
    expect(
      screen.getByRole("switch", { name: "Share phone number" }),
    ).toBeDefined();
  });

  it("shows share phone switch as checked when sharePhone is true", () => {
    mockUseMySettings.mockReturnValue({
      data: { sharePhone: true },
      isLoading: false,
    });

    render(<NotificationPreferences tripId="trip-1" />);

    const sharePhoneSwitch = screen.getByRole("switch", {
      name: "Share phone number",
    });
    expect(sharePhoneSwitch.getAttribute("data-state")).toBe("checked");
  });

  it("calls updateMySettings when toggling share phone", async () => {
    const user = userEvent.setup();

    render(<NotificationPreferences tripId="trip-1" />);

    const sharePhoneSwitch = screen.getByRole("switch", {
      name: "Share phone number",
    });
    await user.click(sharePhoneSwitch);

    expect(mockUpdateMySettingsMutate).toHaveBeenCalledWith(
      { sharePhone: true },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("shows success toast when privacy update succeeds", async () => {
    const user = userEvent.setup();
    mockUpdateMySettingsMutate.mockImplementation(
      (
        _data: unknown,
        options: { onSuccess: () => void; onError: (error: Error) => void },
      ) => {
        options.onSuccess();
      },
    );

    render(<NotificationPreferences tripId="trip-1" />);

    const sharePhoneSwitch = screen.getByRole("switch", {
      name: "Share phone number",
    });
    await user.click(sharePhoneSwitch);

    expect(mockToast.success).toHaveBeenCalledWith("Privacy settings updated");
  });

  it("shows error toast when privacy update fails", async () => {
    const user = userEvent.setup();
    mockUpdateMySettingsMutate.mockImplementation(
      (_data: unknown, options: { onError: (error: Error) => void }) => {
        options.onError(new Error("Server error"));
      },
    );

    render(<NotificationPreferences tripId="trip-1" />);

    const sharePhoneSwitch = screen.getByRole("switch", {
      name: "Share phone number",
    });
    await user.click(sharePhoneSwitch);

    expect(mockToast.error).toHaveBeenCalledWith("Server error");
  });
});
