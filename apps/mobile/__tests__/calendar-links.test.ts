import { describe, expect, it } from "vitest";
import { appleCalendarUrl, googleCalendarUrl } from "@/lib/calendarLinks";

const FEED = "webcal://api.journiful.app/api/calendar/6b3f0a2c-9d1e-4f7a-8c5b-2e9d4a1f7b30.ics";

describe("googleCalendarUrl", () => {
  it("hands the feed over as Google's own add-by-URL link", () => {
    expect(googleCalendarUrl(FEED)).toBe(
      "https://calendar.google.com/calendar/render?cid=" +
        encodeURIComponent(FEED),
    );
  });

  it("encodes the colon and slashes, so Google reads one URL", () => {
    const url = googleCalendarUrl(FEED);
    // The value is a URL, not a part of this one: an unencoded scheme
    // would end the parameter at the first colon.
    expect(url).toContain("cid=webcal%3A%2F%2F");
    expect(new URL(url).searchParams.get("cid")).toBe(FEED);
  });

  it("keeps a dev host's port, which is where the feed actually is", () => {
    const local = "webcal://localhost:8000/api/calendar/token.ics";
    expect(new URL(googleCalendarUrl(local)).searchParams.get("cid")).toBe(
      local,
    );
  });
});

describe("appleCalendarUrl", () => {
  it("leaves the server's webcal URL alone", () => {
    expect(appleCalendarUrl(FEED)).toBe(FEED);
  });

  it("turns an https feed into webcal, so Apple subscribes rather than downloads", () => {
    expect(
      appleCalendarUrl("https://api.journiful.app/api/calendar/token.ics"),
    ).toBe("webcal://api.journiful.app/api/calendar/token.ics");
  });

  it("does not double up the scheme on a host that is not a scheme", () => {
    expect(appleCalendarUrl("webcal://localhost:8000/x.ics")).toBe(
      "webcal://localhost:8000/x.ics",
    );
  });
});
