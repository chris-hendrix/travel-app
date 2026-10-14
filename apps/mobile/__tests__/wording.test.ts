import { describe, expect, it } from "vitest";
import { joinFacts, NOT_SHARED } from "@/lib/wording";
import { formatDay } from "@/lib/dateRange";
import { emptyLeg, farEndNote } from "@/lib/newTravel";

describe("joinFacts", () => {
  it("joins separate facts with a middot", () => {
    expect(joinFacts("Sat Sep 19", "12:30 PM", "BCN T1")).toBe(
      "Sat Sep 19 · 12:30 PM · BCN T1",
    );
  });

  it("drops empty parts rather than stranding a separator", () => {
    expect(joinFacts("Sat Sep 19", null, "BCN T1")).toBe(
      "Sat Sep 19 · BCN T1",
    );
    expect(joinFacts("Sat Sep 19", "  ", undefined)).toBe("Sat Sep 19");
  });

  it("leaves a single fact alone", () => {
    expect(joinFacts("Today", "Fri Sep 18")).toBe("Today · Fri Sep 18");
    expect(joinFacts("Fri Sep 18")).toBe("Fri Sep 18");
  });

  it("does not touch the commas inside a date", () => {
    // A comma stays inside one fact; only the joins are middots.
    expect(joinFacts("Sep 18–26, 2026", "Mallorca")).toBe(
      "Sep 18–26, 2026 · Mallorca",
    );
  });
});

describe("NOT_SHARED", () => {
  it("is one phrase, so one state has one name", () => {
    expect(NOT_SHARED).toBe("Not shared yet");
  });
});

describe("the far end's day, in words", () => {
  // Two notes, one form each, and they are the only place a leg's far end
  // is said out loud. Pinned here because the wording is the feature: the
  // line has to read as what the two times already mean, not as a second
  // control or a second date field.
  const overnight = {
    ...emptyLeg(),
    day: "2026-09-18",
    departureTime: "22:50",
    arrivalTime: "12:30",
  };

  it("reads back as Left <the evening before> under an arrival", () => {
    expect(farEndNote(overnight, "arrival")).toBe(
      `Left ${formatDay("2026-09-17")}`,
    );
  });

  it("reads forward as Lands <the morning after> under a departure", () => {
    const redEye = {
      ...emptyLeg(),
      day: "2026-09-25",
      departureTime: "23:30",
      arrivalTime: "07:15",
    };
    expect(farEndNote(redEye, "departure")).toBe(
      `Lands ${formatDay("2026-09-26")}`,
    );
  });

  it("says nothing when the leg does not cross midnight", () => {
    // "The same day" under a field is noise the chosen day already covers.
    expect(
      farEndNote(
        {
          ...emptyLeg(),
          day: "2026-09-18",
          departureTime: "07:00",
          arrivalTime: "15:40",
        },
        "arrival",
      ),
    ).toBeNull();
  });
});
