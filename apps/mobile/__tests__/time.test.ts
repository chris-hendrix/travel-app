import { describe, expect, it } from "vitest";
import {
  formatClock,
  isClockTime,
  minutesOf,
  timeOptions,
  TIME_STEP_MINUTES,
} from "@/lib/time";

describe("isClockTime", () => {
  it.each(["8:30", "08:30", "23:59", "0:00"])("accepts %s", (value) => {
    expect(isClockTime(value)).toBe(true);
  });

  it.each(["", "8", "8:3", "24:00", "20:60", "eight"])(
    "rejects %s",
    (value) => {
      expect(isClockTime(value)).toBe(false);
    },
  );
});

describe("minutesOf", () => {
  it("counts from midnight", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("8:30")).toBe(510);
    expect(minutesOf("23:45")).toBe(1425);
  });
});

describe("timeOptions", () => {
  const options = timeOptions();

  it("covers the whole day at the picker's step", () => {
    expect(options[0]).toBe("00:00");
    expect(options[options.length - 1]).toBe("23:45");
    expect(options).toHaveLength((24 * 60) / TIME_STEP_MINUTES);
  });

  it("is strictly increasing and zero-padded", () => {
    const sorted = [...options].sort();
    expect(options).toEqual(sorted);
    expect(options.every((option) => /^\d{2}:\d{2}$/.test(option))).toBe(true);
  });
});

describe("formatClock", () => {
  it("prints the same twelve-hour clock the itinerary does", () => {
    expect(formatClock("20:30")).toBe("8:30 PM");
    expect(formatClock("09:00")).toBe("9:00 AM");
  });

  it("says midnight and noon correctly", () => {
    expect(formatClock("00:00")).toBe("12:00 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
  });

  it("passes anything it cannot read straight through", () => {
    expect(formatClock("later")).toBe("later");
  });
});
