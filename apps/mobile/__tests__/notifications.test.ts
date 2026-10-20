import { describe, expect, it } from "vitest";
import {
  newestFirst,
  notificationTarget,
  relativeTime,
  tripFor,
  unreadCount,
  type Notification,
} from "@/lib/notifications";
import type { Trip } from "@/components/trip/TripCard";

/** Fixed clock, noon, so day boundaries are not at the mercy of the runner. */
const now = new Date(2026, 8, 19, 12, 0, 0);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A moment exactly that long before the fixed clock. */
const back = (ms: number) => new Date(now.getTime() - ms).toISOString();

/** A specific local moment, for calendar-day cases. */
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 8, day, hour, minute, 0).toISOString();

function note(
  id: string,
  createdAt: string,
  readAt: string | null = null,
  tripId: string | null = "picos",
): Notification {
  return {
    id,
    type: "trip_message",
    title: "New message",
    body: id,
    tripId,
    data: null,
    createdAt,
    readAt,
  };
}

describe("relativeTime", () => {
  it("says just now inside the first minute", () => {
    expect(relativeTime(back(0), now)).toBe("just now");
    expect(relativeTime(back(30_000), now)).toBe("just now");
  });

  it("counts minutes, then hours", () => {
    expect(relativeTime(back(1 * MINUTE), now)).toBe("a minute ago");
    expect(relativeTime(back(2 * MINUTE), now)).toBe("2 minutes ago");
    expect(relativeTime(back(59 * MINUTE), now)).toBe("59 minutes ago");
    expect(relativeTime(back(1 * HOUR), now)).toBe("an hour ago");
    expect(relativeTime(back(3 * HOUR), now)).toBe("3 hours ago");
  });

  it("uses calendar days, so late last night is yesterday", () => {
    // 11pm the previous evening — 13 hours before a noon "now".
    expect(relativeTime(at(18, 23), now)).toBe("yesterday");
    expect(relativeTime(at(17), now)).toBe("2 days ago");
    expect(relativeTime(at(14), now)).toBe("5 days ago");
  });

  it("reaches for weeks, then months, then stops", () => {
    expect(relativeTime(at(10), now)).toBe("last week"); // 9 days
    expect(relativeTime(new Date(2026, 7, 29, 12).toISOString(), now)).toBe(
      "3 weeks ago", // 21 days
    );
    expect(relativeTime(new Date(2026, 7, 10, 12).toISOString(), now)).toBe(
      "last month", // 40 days
    );
    expect(relativeTime(new Date(2026, 5, 19, 12).toISOString(), now)).toBe(
      "3 months ago", // 92 days
    );
    expect(relativeTime(new Date(2025, 7, 15, 12).toISOString(), now)).toBe(
      "over a year ago", // 400 days
    );
  });

  it("does not go negative for a clock that runs ahead", () => {
    expect(relativeTime(back(-5 * MINUTE), now)).toBe("just now");
  });
});

describe("newestFirst", () => {
  it("orders by timestamp, not by read state", () => {
    const older = note("older", at(10), at(11));
    const newer = note("newer", at(18), at(18, 13));
    const middle = note("middle", at(19, 9));

    expect(newestFirst([older, middle, newer]).map((n) => n.id)).toEqual([
      "middle",
      "newer",
      "older",
    ]);
  });

  it("leaves the array it was given alone", () => {
    const rows = [note("a", at(10)), note("b", at(19))];
    newestFirst(rows);
    expect(rows.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("unreadCount", () => {
  it("counts only the rows with no read timestamp", () => {
    expect(
      unreadCount([
        note("a", at(19, 11)),
        note("b", at(19, 10), at(19, 11)),
        note("c", at(18)),
      ]),
    ).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});

describe("tripFor", () => {
  const trips = [
    { id: "picos", title: "Los Picos Trail", image: "picos.jpg" },
    { id: "lisbon", title: "Dana's 30th", image: "lisbon.jpg" },
  ] as Trip[];

  it("resolves the trip the API only named by id", () => {
    expect(tripFor(trips, note("a", at(19)))?.title).toBe("Los Picos Trail");
  });

  it("has nothing to show for a trip-less notification", () => {
    expect(tripFor(trips, note("a", at(19), null, null))).toBeUndefined();
  });

  it("has nothing to show for a trip the user has left", () => {
    expect(tripFor(trips, note("a", at(19), null, "kyoto"))).toBeUndefined();
  });
});

describe("notificationTarget", () => {
  it("opens the trip the notification is about", () => {
    expect(notificationTarget(note("a", at(19)))).toBe(
      "/trips/detail?id=picos",
    );
  });

  it("opens the trip for every type the API raises about a live one", () => {
    // The five types that name a trip this person can still open. An
    // invite is already a membership by the time it can be read
    // (`processPendingInvitations`), so its trip is a real door too —
    // only the delete is not, and the next test is its case.
    for (const type of [
      "mutual_invite",
      "sms_invite",
      "trip_message",
      "daily_itinerary",
      "trip_update",
    ] as const) {
      expect(notificationTarget({ ...note("a", at(19)), type })).toBe(
        "/trips/detail?id=picos",
      );
    }
  });

  it("escapes an id that would otherwise rewrite the query", () => {
    expect(notificationTarget(note("a", at(19), null, "a&b=c"))).toBe(
      "/trips/detail?id=a%26b%3Dc",
    );
  });

  it("stays put for a deleted trip, which the detail answers 404 for", () => {
    expect(
      notificationTarget({ ...note("a", at(19)), type: "trip_cancelled" }),
    ).toBeNull();
  });

  it("stays put for a notification about no trip at all", () => {
    expect(notificationTarget(note("a", at(19), null, null))).toBeNull();
  });
});
