import { describe, expect, it } from "vitest";
import { formatDaySpan } from "@/lib/dateRange";
import { buildStay, draftFromStay, validateNewStay } from "@/lib/newStay";
import {
  currentStay,
  nightsLabel,
  stayArea,
  staySpan,
  stayStart,
  stayTime,
  type Stay,
} from "@/lib/stays";
import { wallClock } from "@/lib/timezone";

/** A stay with only what a test cares about; everything else is empty. */
function stay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: "stay-1",
    name: "Ca'n Puig",
    address: "Carrer de la Mar 14, 07100 Sóller",
    addressLat: null,
    addressLon: null,
    description: null,
    checkIn: null,
    checkOut: null,
    image: "https://example.com/photo.jpg",
    links: [],
    deletedAt: null,
    ...overrides,
  };
}

/** A local datetime, so the clock reads the same in any device zone. */
function at(day: string, clock: string): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = clock.split(":").map(Number) as [number, number];
  return new Date(year, month - 1, date, hour, minute).toISOString();
}

describe("formatDaySpan", () => {
  it("names the month once when both ends are in it", () => {
    expect(formatDaySpan("2026-09-17", "2026-09-23")).toBe("Sep 17–23");
  });

  it("names both when the stay runs into the next month", () => {
    expect(formatDaySpan("2026-09-28", "2026-10-03")).toBe("Sep 28 – Oct 3");
  });
});

describe("a stay's own facts", () => {
  it("reads the town off the address, past the postcode", () => {
    expect(stayArea(stay())).toBe("Sóller");
    expect(stayArea(stay({ address: "Refugi de Múclet, Deià" }))).toBe("Deià");
    expect(stayArea(stay({ address: null }))).toBeNull();
  });

  it("spans its two days", () => {
    const puig = stay({
      checkIn: at("2026-09-17", "15:00"),
      checkOut: at("2026-09-23", "10:00"),
    });

    expect(staySpan(puig, null)).toBe("Sep 17–23");
    expect(nightsLabel(puig, null)).toBe("6 nights");
    expect(stayArea(puig)).toBe("Sóller");
  });

  it("says nothing it does not know", () => {
    const undated = stay();

    expect(staySpan(undated, null)).toBeNull();
    expect(nightsLabel(undated, null)).toBeNull();
    // The town is still a fact about it, so the row has a chip to wear.
    expect(stayArea(undated)).toBe("Sóller");
  });

  it("counts one night in the singular", () => {
    const oneNight = stay({
      checkIn: at("2026-09-17", "16:00"),
      checkOut: at("2026-09-18", "10:00"),
    });

    expect(nightsLabel(oneNight, null)).toBe("1 night");
  });
});

describe("currentStay", () => {
  const first = stay({
    id: "first",
    name: "Múclet",
    checkIn: at("2026-09-17", "15:00"),
    checkOut: at("2026-09-18", "10:00"),
  });
  const second = stay({
    id: "second",
    name: "Ca'n Puig",
    checkIn: at("2026-09-18", "15:00"),
    checkOut: at("2026-09-20", "10:00"),
  });

  it("is the one today falls inside", () => {
    expect(currentStay([first, second], "2026-09-18", null)?.name).toBe(
      "Múclet",
    );
    expect(currentStay([first, second], "2026-09-19", null)?.name).toBe(
      "Ca'n Puig",
    );
  });

  it("is the next one when none has begun", () => {
    expect(currentStay([first, second], "2026-09-10", null)?.name).toBe(
      "Múclet",
    );
  });

  it("is the last one when they are all behind", () => {
    expect(currentStay([first, second], "2026-10-01", null)?.name).toBe(
      "Ca'n Puig",
    );
  });

  it("skips a stay with no dates rather than guessing at it", () => {
    const undated = stay({ id: "undated", name: "Somewhere" });

    expect(currentStay([undated], "2026-09-18", null)).toBeUndefined();
    expect(currentStay([undated, second], "2026-09-19", null)?.name).toBe(
      "Ca'n Puig",
    );
  });
});


describe("validateNewStay", () => {
  const base = {
    name: "Ca'n Puig",
    address: "Carrer de la Mar 14, 07100 Sóller",
    checkInDay: "2026-09-17",
    checkOutDay: "2026-09-23",
    checkInTime: "15:00",
    checkOutTime: "",
    description: "",
  };

  it("accepts a stay with only the four answers that make one", () => {
    expect(validateNewStay(base)).toEqual({});
  });

  it("wants a name and an address", () => {
    const errors = validateNewStay({ ...base, name: "  ", address: "" });

    expect(errors.name).toBe("Give the place a name.");
    expect(errors.address).toBe("Where is it?");
  });

  it("refuses a stay that ends before it starts", () => {
    const errors = validateNewStay({
      ...base,
      checkOutDay: "2026-09-16",
    });

    expect(errors.checkOutDay).toBe("It ends before it starts.");
  });

  it("checks the times only when one was given", () => {
    expect(validateNewStay({ ...base, checkInTime: "" })).toEqual({});
    expect(validateNewStay({ ...base, checkInTime: "3pm" }).checkInTime).toBe(
      "Check-in as HH:MM.",
    );
  });

  it("never asks for a description", () => {
    expect(validateNewStay({ ...base, description: "" })).toEqual({});
  });
});

describe("buildStay", () => {
  it("stamps the days on the trip's own clock", () => {
    const puig = buildStay(
      {
        name: "Ca'n Puig",
        address: "Carrer de la Mar 14, 07100 Sóller",
        checkInDay: "2026-09-17",
        checkOutDay: "2026-09-23",
        checkInTime: "15:00",
        checkOutTime: "10:00",
        description:
          "Lockbox left of the blue gate — 4417.\n\nWifi PuigSoller / tramuntana2019.",
      },
      "stay-1",
      null,
      "https://example.com/photo.jpg",
    );

    expect(wallClock(puig.checkIn!, null)).toMatchObject({
      date: "2026-09-17",
      time: "3:00 PM",
    });
    expect(wallClock(puig.checkOut!, null)).toMatchObject({
      date: "2026-09-23",
      time: "10:00 AM",
    });
    // The way in is prose, and the prose is kept whole.
    expect(puig.description).toContain("tramuntana2019");
  });

  it("keeps an empty field empty rather than as an empty string", () => {
    const oderberger = buildStay(
      {
        name: "Hotel Oderberger",
        address: "Oderberger Str. 57, 10435 Berlin",
        checkInDay: "2026-09-17",
        checkOutDay: "2026-09-20",
        checkInTime: "",
        checkOutTime: "",
        description: "  ",
      },
      "stay-2",
      null,
      "https://example.com/photo.jpg",
    );

    expect(oderberger.description).toBeNull();
    // A day and no clock is a real state: midnight is where the day
    // starts, and the screen prints only the day.
    expect(wallClock(oderberger.checkIn!, null).clock).toBe("00:00");
  });

  it("comes back to the form the way it was typed", () => {
    const puig = stay({
      checkIn: at("2026-09-17", "15:00"),
      checkOut: at("2026-09-23", "10:00"),
      description: "Lockbox 4417.",
    });
    const draft = draftFromStay(puig, null);

    expect(draft).toMatchObject({
      name: "Ca'n Puig",
      checkInDay: "2026-09-17",
      checkOutDay: "2026-09-23",
      checkInTime: "15:00",
      checkOutTime: "10:00",
      description: "Lockbox 4417.",
    });
  });
});

describe("a stay nobody gave a time for", () => {
  // A friend's spare room: the nights are known and the hours are not.
  // Midnight is the column's way of saying so, and it must not print.
  const friends = stay({
    checkIn: at("2026-09-17", "00:00"),
    checkOut: at("2026-09-20", "00:00"),
    description: "Kirsten's place. The door is open.",
  });

  it("still knows its days, its span and its nights", () => {
    expect(stayStart(friends, null)).toBe("2026-09-17");
    expect(staySpan(friends, null)).toBe("Sep 17–20");
    expect(nightsLabel(friends, null)).toBe("3 nights");
  });

  it("prints no clock rather than an invented 12:00 AM", () => {
    expect(stayTime(friends.checkIn, null)).toBeNull();
    expect(stayTime(friends.checkOut, null)).toBeNull();
  });

  it("still prints a clock when there is one", () => {
    expect(stayTime(at("2026-09-17", "15:00"), null)).toBe("3:00 PM");
  });

  it("asks the form for no time it was never given", () => {
    expect(draftFromStay(friends, null)).toMatchObject({
      checkInDay: "2026-09-17",
      checkOutDay: "2026-09-20",
      checkInTime: "",
      checkOutTime: "",
    });
  });
});
