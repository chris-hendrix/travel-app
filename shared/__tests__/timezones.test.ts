import { describe, expect, it } from "vitest";
import {
  getDetectedTimezone,
  getTimezoneAbbr,
  getTimezoneLabel,
  TIMEZONES,
} from "../utils/timezones";

describe("TIMEZONES", () => {
  it("covers the zones the mocks and the lab actually use", () => {
    const values = TIMEZONES.map((zone) => zone.value);
    for (const zone of [
      "America/New_York",
      "Europe/Madrid",
      "Europe/Lisbon",
      "Europe/Rome",
      "Europe/Paris",
      "Atlantic/Reykjavik",
      "America/Los_Angeles",
    ]) {
      expect(values).toContain(zone);
    }
  });

  it("labels every entry, with no empty strings either side", () => {
    for (const zone of TIMEZONES) {
      expect(zone.value.trim()).not.toBe("");
      expect(zone.label.trim()).not.toBe("");
    }
  });
});

describe("getTimezoneLabel", () => {
  it("names a known zone in words", () => {
    expect(getTimezoneLabel("America/New_York")).toContain("Eastern");
  });

  it("falls back to the identifier for a zone the list never heard of", () => {
    expect(getTimezoneLabel("Pacific/Kiritimati")).toBe(
      "Pacific/Kiritimati",
    );
  });
});

describe("getTimezoneAbbr", () => {
  const summer = new Date("2026-09-20T12:00:00Z");
  const winter = new Date("2026-01-20T12:00:00Z");

  it("names the zones no single locale names", () => {
    // en-US calls New York EDT and Madrid GMT+2; en-GB does the reverse.
    // The helper tries both, so each gets its own name.
    expect(getTimezoneAbbr("America/New_York", summer)).toBe("EDT");
    expect(getTimezoneAbbr("Europe/Madrid", summer)).toBe("CEST");
    expect(getTimezoneAbbr("Australia/Sydney", summer)).toBe("AEST");
  });

  it("follows the season, rather than naming one of the two", () => {
    expect(getTimezoneAbbr("America/New_York", summer)).toBe("EDT");
    expect(getTimezoneAbbr("America/New_York", winter)).toBe("EST");
    expect(getTimezoneAbbr("Europe/Madrid", winter)).toBe("CET");
  });

  it("uses our own abbreviation where no locale has one", () => {
    // Tokyo is GMT+9 in every locale tried, and JST in our list.
    expect(getTimezoneAbbr("Asia/Tokyo", summer)).toBe("JST");
  });

  it("reads the identifier back when nothing can say it", () => {
    expect(getTimezoneAbbr("Not/AZone", summer)).toBe("Not/AZone");
  });
});

describe("getDetectedTimezone", () => {
  it("returns whatever the runtime believes", () => {
    expect(typeof getDetectedTimezone()).toBe("string");
  });
});
