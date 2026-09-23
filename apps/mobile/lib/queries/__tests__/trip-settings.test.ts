import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRequire } from "node:module";

// Same probe seam as `trip-update.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the rollback test asserts `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { ApiError, apiFetch } from "@/lib/api";
import {
  getNotificationPreferences,
  updateNotificationPreference,
  updateSharePhone,
} from "@/lib/queries/trip-settings";
import {
  TripSettingsProvider,
  useTripSettings,
} from "@/lib/tripSettingsStore";

const mockedApiFetch = vi.mocked(apiFetch);

describe("updateSharePhone", () => {
  it("PATCHes /trips/:tripId/my-settings with {sharePhone} and returns the server value", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      sharePhone: true,
      calendarExcluded: false,
    });

    const sharePhone = await updateSharePhone("trip-1", true);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/my-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharePhone: true }),
    });
    expect(sharePhone).toBe(true);
  });
});

describe("updateNotificationPreference", () => {
  it("flips dailyItinerary with a read-modify-write PUT preserving tripMessages", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch
      .mockResolvedValueOnce({
        success: true,
        preferences: { dailyItinerary: true, tripMessages: true },
      })
      .mockResolvedValueOnce({
        success: true,
        preferences: { dailyItinerary: false, tripMessages: true },
      });

    const prefs = await updateNotificationPreference("trip-1", {
      dailyItinerary: false,
    });

    // The GET comes first: the PUT is full-replace with both booleans
    // required, so the client reads before it writes.
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      "/trips/trip-1/notification-preferences",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/trips/trip-1/notification-preferences",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyItinerary: false, tripMessages: true }),
      },
    );
    expect(prefs).toEqual({ dailyItinerary: false, tripMessages: true });
  });

  it("flips tripMessages with a read-modify-write PUT preserving dailyItinerary", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch
      .mockResolvedValueOnce({
        success: true,
        preferences: { dailyItinerary: false, tripMessages: true },
      })
      .mockResolvedValueOnce({
        success: true,
        preferences: { dailyItinerary: false, tripMessages: false },
      });

    const prefs = await updateNotificationPreference("trip-1", {
      tripMessages: false,
    });

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      "/trips/trip-1/notification-preferences",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/trips/trip-1/notification-preferences",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyItinerary: false, tripMessages: false }),
      },
    );
    expect(prefs).toEqual({ dailyItinerary: false, tripMessages: false });
  });

  it("reads the current preferences through GET", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      preferences: { dailyItinerary: true, tripMessages: false },
    });

    await expect(getNotificationPreferences("trip-1")).resolves.toEqual({
      dailyItinerary: true,
      tripMessages: false,
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/notification-preferences",
    );
  });
});

describe("local-only prefs", () => {
  function captureUpdate() {
    const seen: {
      update:
        | ((
            tripId: string,
            patch: Record<string, unknown>,
          ) => void)
        | null;
    } = { update: null };
    function Probe() {
      const settings = useTripSettings();
      seen.update = settings.update as typeof seen.update;
      return null;
    }
    renderToString(
      createElement(
        TripSettingsProvider,
        { children: createElement(Probe) },
      ),
    );
    if (!seen.update) throw new Error("update was not captured");
    return seen.update;
  }

  it("clock and showPast stay in the local store and never hit the network", () => {
    mockedApiFetch.mockReset();
    const update = captureUpdate();

    update("trip-1", { clock: "device" });
    update("trip-1", { showPast: true });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("a calendar-inclusion write goes to the calendar router, not my-settings", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    // Only the request is asserted, not the painted value: this seam is a
    // server render, so the `for` captured here is bound to the state the
    // provider had at that moment and never sees the write. The rollback
    // test below is the other half — a rollback only means something if
    // there was a paint to undo.
    const seen: {
      setCalendarIncluded:
        | ((tripId: string, value: boolean) => Promise<void>)
        | null;
    } = { setCalendarIncluded: null };
    function Probe() {
      seen.setCalendarIncluded = useTripSettings().setCalendarIncluded;
      return null;
    }
    renderToString(
      createElement(
        TripSettingsProvider,
        { children: createElement(Probe) },
      ),
    );
    if (!seen.setCalendarIncluded) {
      throw new Error("settings accessors were not captured");
    }

    // Off means excluded, which is the server's own word for it.
    await seen.setCalendarIncluded("trip-1", false);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/members/me/calendar",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: true }),
      },
    );
  });

  it("a failed calendar-inclusion write rolls the optimistic paint back", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to update"));

    const seen: {
      setCalendarIncluded:
        | ((tripId: string, value: boolean) => Promise<void>)
        | null;
    } = { setCalendarIncluded: null };
    function Probe() {
      seen.setCalendarIncluded = useTripSettings().setCalendarIncluded;
      return null;
    }
    renderToString(
      createElement(
        TripSettingsProvider,
        { children: createElement(Probe) },
      ),
    );
    if (!seen.setCalendarIncluded) throw new Error("not captured");

    await expect(
      seen.setCalendarIncluded("trip-1", false),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("a failed sharePhone write rolls the optimistic paint back", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to update"));

    const seen: {
      forSettings:
        | ((trip: {
            id: string;
            endDate: string;
            preferredTimezone: string;
          }) => { sharePhone: boolean })
        | null;
      setSharePhone: ((tripId: string, value: boolean) => Promise<void>) | null;
    } = { forSettings: null, setSharePhone: null };
    function Probe() {
      const settings = useTripSettings();
      seen.forSettings = settings.for as unknown as typeof seen.forSettings;
      seen.setSharePhone = settings.setSharePhone;
      return null;
    }
    renderToString(
      createElement(
        TripSettingsProvider,
        { children: createElement(Probe) },
      ),
    );
    if (!seen.setSharePhone || !seen.forSettings) {
      throw new Error("settings accessors were not captured");
    }

    await expect(seen.setSharePhone("trip-1", true)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/my-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharePhone: true }),
    });
  });
});
