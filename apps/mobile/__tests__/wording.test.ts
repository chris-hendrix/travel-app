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
  // One note, every mode, and it is the only place a leg's far end is said
  // out loud. Pinned here because the wording is the feature: the line has
  // to read as what the two times already mean, not as a second control or
  // a second date field.
  //
  // The verb is the *far end's own word*, read from the same table the
  // form's labels come from (`lib/transportMode.ts`): the note sits under
  // that end's field, and a line that named the end differently from the
  // label above it would be two vocabularies for one fact — the drift D3
  // forbids. It also means a hire reads, because a hire's far end is the
  // counter — a pickup behind an arrival, a dropoff behind a departure —
  // and the flight's `Left`/`Lands` could not say so.
  const overnight = {
    ...emptyLeg(),
    day: "2026-09-18",
    departureTime: "22:50",
    arrivalTime: "12:30",
  };

  it("names the far end in the end's own word, under an arrival", () => {
    expect(farEndNote(overnight, "arrival")).toBe(
      `Leaves ${formatDay("2026-09-17")}`,
    );
  });

  it("reads a hire's far end as the pickup it is", () => {
    // A hire's own end is the plan at the trip, so on an arrival row the
    // far end is the counter the car was collected from — the evening
    // before, in the pickup's own word. The flight's words said `Left <the
    // day>`, which is a fact about a departure the member never made.
    const hire = {
      ...emptyLeg(),
      transportMode: "rental" as const,
      day: "2026-09-18",
      departureTime: "20:00",
      arrivalTime: "01:30",
    };
    expect(farEndNote(hire, "arrival")).toBe(
      `Pickup ${formatDay("2026-09-17")}`,
    );
  });

  it("reads a hire's far end as the dropoff on a departure row", () => {
    // The other half: leaving at 20:00 and handing the car back at 01:30
    // puts the dropoff the morning after, in the dropoff's own word.
    const hire = {
      ...emptyLeg(),
      transportMode: "rental" as const,
      day: "2026-09-20",
      departureTime: "20:00",
      arrivalTime: "01:30",
    };
    expect(farEndNote(hire, "departure")).toBe(
      `Dropoff ${formatDay("2026-09-21")}`,
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
