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
  it("shortens a zone to its display name", () => {
    // Node ships full ICU, so these are stable here. On Hermes without
    // it, the helper falls back to the identifier instead of throwing.
    expect(getTimezoneAbbr("America/New_York")).toMatch(/EST|EDT/);
  });

  it("reads the identifier back when the runtime cannot say it", () => {
    expect(getTimezoneAbbr("Not/AZone")).toBe("Not/AZone");
  });
});

describe("getDetectedTimezone", () => {
  it("returns whatever the runtime believes", () => {
    expect(typeof getDetectedTimezone()).toBe("string");
  });
});
