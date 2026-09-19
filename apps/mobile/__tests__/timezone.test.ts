import { describe, expect, it } from "vitest";
import { todayIn, wallClock } from "@/lib/timezone";

/** Noon UTC on a September day: morning in the Americas, evening in Asia. */
const noonUtc = new Date(Date.UTC(2026, 8, 19, 12, 0)).toISOString();

describe("wallClock", () => {
  it("reads an instant on the trip's clock", () => {
    expect(wallClock(noonUtc, "Europe/Madrid")).toEqual({
      date: "2026-09-19",
      time: "2:00 PM",
    });
    expect(wallClock(noonUtc, "Asia/Tokyo")).toEqual({
      date: "2026-09-19",
      time: "9:00 PM",
    });
    expect(wallClock(noonUtc, "America/Los_Angeles")).toEqual({
      date: "2026-09-19",
      time: "5:00 AM",
    });
  });

  it("crosses the date when the zones are far enough apart", () => {
    const late = new Date(Date.UTC(2026, 8, 19, 23, 30)).toISOString();
    expect(wallClock(late, "Asia/Tokyo").date).toBe("2026-09-20");
    expect(wallClock(late, "America/Los_Angeles").date).toBe("2026-09-19");
  });

  it("reads midnight as twelve, not as zero", () => {
    const midnight = new Date(Date.UTC(2026, 8, 19, 0, 5)).toISOString();
    expect(wallClock(midnight, "UTC").time).toBe("12:05 AM");
    const noon = new Date(Date.UTC(2026, 8, 19, 12, 5)).toISOString();
    expect(wallClock(noon, "UTC").time).toBe("12:05 PM");
  });

  it("falls back to the device when it does not know the zone", () => {
    const bogus = wallClock(noonUtc, "Mars/Olympus_Mons");
    const device = wallClock(noonUtc, null);
    expect(bogus).toEqual(device);
  });
});

describe("todayIn", () => {
  it("answers with the date it is somewhere, not everywhere", () => {
    const now = new Date(Date.UTC(2026, 8, 19, 23, 30));
    expect(todayIn("Asia/Tokyo", now)).toBe("2026-09-20");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-09-19");
  });
});
