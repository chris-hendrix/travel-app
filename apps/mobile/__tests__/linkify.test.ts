import { describe, expect, it } from "vitest";
import { linkedRuns, truncateRuns } from "@/lib/linkify";
import type { ProseRun } from "@/lib/linkify";

type LinkRun = Extract<ProseRun, { type: "link" }>;

/** The link runs out of a split, narrowed, so a test can read their hrefs. */
const links = (runs: ProseRun[]): LinkRun[] =>
  runs.filter((run): run is LinkRun => run.type === "link");

/** What the reader actually sees: every run's label, end to end. */
const shown = (runs: ProseRun[]): string =>
  runs.map((run) => run.value).join("");

/**
 * The invisible characters a link must never carry. Two families: the
 * zero-width joiners and marks that hide text, and the bidi overrides
 * that re-read it backwards — which is how `https://example.com/…gpj.exe`
 * spells `jpg.exe` to a reader and something else to the network.
 * U+200B–U+200F, U+202A–U+202E, U+2066–U+2069 and U+FEFF, one by one,
 * because the guard has to hold for each and not just for the two that
 * got caught in the wild.
 */
const INVISIBLE = [
  "\u200B", // zero-width space
  "\u200C", // zero-width non-joiner
  "\u200D", // zero-width joiner
  "\u200E", // left-to-right mark
  "\u200F", // right-to-left mark
  "\u202A", // left-to-right embedding
  "\u202B", // right-to-left embedding
  "\u202C", // pop directional formatting
  "\u202D", // left-to-right override
  "\u202E", // right-to-left override
  "\u2066", // left-to-right isolate
  "\u2067", // right-to-left isolate
  "\u2068", // first strong isolate
  "\u2069", // pop directional isolate
  "\uFEFF", // zero-width no-break space, the byte-order mark
];

describe("linkedRuns", () => {
  it("splits the prose into runs in the order it was written", () => {
    expect(
      linkedRuns("Meet at the dock, then book on booking.com by Friday."),
    ).toEqual([
      { type: "text", value: "Meet at the dock, then book on " },
      { type: "link", value: "booking.com", href: "https://booking.com" },
      { type: "text", value: " by Friday." },
    ]);
  });

  it("links the three ways an author writes an address", () => {
    for (const written of [
      "https://x.com/a",
      "www.google.com",
      "google.com",
    ]) {
      const runs = linkedRuns(`see ${written} today`);
      expect(runs.map((run) => run.type)).toEqual(["text", "link", "text"]);
      expect(links(runs).map((run) => run.value)).toEqual([written]);
    }
  });

  it("supplies the scheme the author left off, and only then", () => {
    const href = (prose: string) => links(linkedRuns(prose))[0]?.href;
    expect(href("booking.com")).toBe("https://booking.com");
    expect(href("www.google.com")).toBe("https://www.google.com");
    // A scheme the author did write is kept as written: http is a
    // different address to a reader, and it is not this module's to
    // upgrade.
    expect(href("http://x.com/a")).toBe("http://x.com/a");
    expect(href("https://x.com/a")).toBe("https://x.com/a");
  });

  it("does not mistake a handle, a tag or a phone number for a site", () => {
    for (const prose of [
      "host@airbnb.com",
      "@dana",
      "#cabo",
      "+1 555 123 4567",
    ]) {
      expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
    }
  });

  it("ends the link before the punctuation that framed it", () => {
    expect(linkedRuns("(see booking.com).")).toEqual([
      { type: "text", value: "(see " },
      { type: "link", value: "booking.com", href: "https://booking.com" },
      { type: "text", value: ")." },
    ]);
  });

  it("does not mistake a filename or a price for a site", () => {
    for (const prose of ["itinerary.pdf", "route.gpx", "14.40"]) {
      expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
    }
  });

  it("refuses a link that reorders or hides the text inside it", () => {
    // The two characters that matter, in the shape they arrive in: a
    // right-to-left override in the path, a zero-width space in the host.
    for (const prose of [
      "booked at https://example.com/\u202Excod.exe",
      "booked at https://exa\u200Bmple.com/booking",
      "booked at https://example.com/\u2066booking",
    ]) {
      expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
    }
  });

  it("stops the link at a character it will not swallow", () => {
    // The matcher ends a match before a byte-order mark rather than
    // carrying it, so the address still links and the invisible character
    // stays in the prose: the same safe outcome by the other route.
    const prose = "booked at https://example.com/booking\uFEFF";
    const runs = linkedRuns(prose);
    expect(links(runs).map((run) => run.value)).toEqual([
      "https://example.com/booking",
    ]);
    expect(shown(runs)).toBe(prose);
  });

  it("holds the guard for every bidi and zero-width character", () => {
    for (const char of INVISIBLE) {
      for (const prose of [
        `see https://example.com/a${char}b now`,
        `see https://exa${char}mple.com/a now`,
        `see example${char}.com now`,
      ]) {
        const runs = linkedRuns(prose);
        for (const run of links(runs)) {
          expect(run.value).not.toContain(char);
          expect(run.href).not.toContain(char);
        }
        expect(shown(runs)).toBe(prose);
      }
    }
  });

  it("keeps the paragraph breaks, which are part of the prose", () => {
    expect(linkedRuns("Booked at booking.com\n\nGate code 4417.")).toEqual([
      { type: "text", value: "Booked at " },
      { type: "link", value: "booking.com", href: "https://booking.com" },
      { type: "text", value: "\n\nGate code 4417." },
    ]);
  });

  it("returns one run for a description with nothing to link", () => {
    // The regression guard: a description made only of prose has to
    // render the markup it renders today, byte for byte, so the split
    // has to be a single run rather than a run per line or per word.
    const prose =
      "Night one: marina berth 12.\n\n" +
      "The gate code is 4417 — please don't share it.\n\n" +
      "Linens are in the cupboard above the sink.";
    expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
  });

  it("returns one run for a description with nothing in it", () => {
    // Same rule, at its edge: the renderer is told "one prose run" and
    // never has to special-case the empty string.
    expect(linkedRuns("")).toEqual([{ type: "text", value: "" }]);
  });

  it("reproduces the prose exactly, character for character", () => {
    for (const prose of [
      "",
      "no link here",
      " booking.com ",
      "a\n\nbooking.com\n\nb",
      "(see booking.com).",
      "one booking.com and two google.com.",
      "booked at https://example.com/\u202Excod.exe today",
    ]) {
      expect(shown(linkedRuns(prose))).toBe(prose);
    }
  });

  it("never writes two prose runs side by side", () => {
    // A refused match sits between two stretches of prose; it must be
    // swallowed back into one run rather than splitting it in three.
    for (const prose of [
      "a booking.com b",
      "a https://example.com/\u202Eb c",
      "a https://exa\u200Bmple.com b",
    ]) {
      const types = linkedRuns(prose).map((run) => run.type);
      expect(types.join(",")).not.toContain("text,text");
    }
  });
});

describe("truncateRuns", () => {
  it("hands the runs back as they came when they fit", () => {
    const runs = linkedRuns("book on booking.com today");
    expect(truncateRuns(runs, 160)).toEqual({ runs, truncated: false });
  });

  it("does not call a description of exactly the limit truncated", () => {
    const runs = linkedRuns("a".repeat(160));
    expect(truncateRuns(runs, 160)).toEqual({ runs, truncated: false });
  });

  it("cuts at the limit and appends the mark", () => {
    const { runs, truncated } = truncateRuns(linkedRuns("a".repeat(200)), 160);
    expect(truncated).toBe(true);
    expect(shown(runs)).toBe("a".repeat(160) + "…");
  });

  it("never leaves a live link pointing at half an address", () => {
    // The cut lands four characters into `booking.com`.
    const prose = "x".repeat(155) + " booking.com";
    const { runs, truncated } = truncateRuns(linkedRuns(prose), 160);
    expect(truncated).toBe(true);
    expect(links(runs)).toEqual([]);
    expect(shown(runs)).toBe("x".repeat(155) + " book…");
  });

  it("keeps a link that survives whole", () => {
    const prose = "book on booking.com then " + "y".repeat(200);
    const { runs, truncated } = truncateRuns(linkedRuns(prose), 160);
    expect(truncated).toBe(true);
    expect(runs[1]).toEqual({
      type: "link",
      value: "booking.com",
      href: "https://booking.com",
    });
    expect(shown(runs)).toBe(prose.slice(0, 160) + "…");
  });

  it("cuts a prose run the same way it cuts a link", () => {
    const prose = "see booking.com " + "z".repeat(200);
    const { runs } = truncateRuns(linkedRuns(prose), 160);
    expect(runs).toHaveLength(3);
    expect(runs[1]).toEqual({
      type: "link",
      value: "booking.com",
      href: "https://booking.com",
    });
    expect(runs[2]).toEqual({
      type: "text",
      // Kept from where the link ended, cut at the limit: the space and
      // 144 of the 200 letters.
      value: prose.slice(15, 160) + "…",
    });
  });

  it("trims the whitespace the cut left hanging", () => {
    const prose = "a".repeat(150) + " ".repeat(10) + "b".repeat(50);
    const { runs } = truncateRuns(linkedRuns(prose), 160);
    expect(shown(runs)).toBe("a".repeat(150) + "…");
  });

  it("keeps saying it was cut when the trim left the text short", () => {
    // Trailing whitespace burns budget and then disappears, so what
    // survives is 151 characters — well inside the limit. The flag is a
    // fact about the description, not about how it now reads.
    const prose = "a".repeat(150) + " ".repeat(30) + "tail";
    const { runs, truncated } = truncateRuns(linkedRuns(prose), 160);
    expect(truncated).toBe(true);
    expect(shown(runs)).toBe("a".repeat(150) + "…");
  });

  it("changes nothing the second time it is given the cut runs", () => {
    // A renderer that re-reads the description should not stack ellipses.
    const once = truncateRuns(linkedRuns("a".repeat(200)), 160);
    const twice = truncateRuns(once.runs, 160);
    expect(twice.runs).toEqual(once.runs);
    expect(twice.truncated).toBe(true);
  });
});
