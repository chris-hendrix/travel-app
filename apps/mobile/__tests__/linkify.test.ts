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
 * The invisible characters a link must never carry, enumerated here and not
 * read out of the implementation: a list copied from the source can only
 * prove the source agrees with itself, and the whole point of this test is
 * to catch a character the source forgot.
 *
 * Four families. The format controls that re-read a line backwards — which
 * is how `https://example.com/…gpj.exe` spells `jpg.exe` to a reader and
 * something else to the network. The zero-width characters that hide part
 * of an address. The C0/C1 controls that end a string at the platform while
 * the reader still sees the rest. And the variation selectors and tag
 * characters, which can carry a whole hidden second string after a visible
 * address — the pair below is written as escapes because a tag character is
 * invisible in this file too.
 */
const INVISIBLE = [
  "\u0000", // NUL, ends a URL at the C string boundary
  "\u0008", // backspace
  "\u001B", // escape
  "\u001F", // unit separator, the far end of the C0 block
  "\u007F", // delete
  "\u0085", // next line
  "\u009F", // application program command, the far end of C1
  "\u00AD", // soft hyphen
  "\u034F", // combining grapheme joiner
  "\u061C", // Arabic letter mark
  "\u115F", // Hangul choseong filler, renders as nothing in a Latin line
  "\u1160", // Hangul jungseong filler
  "\u17B4", // Khmer inherent vowel, invisible
  "\u17B5", // Khmer inherent vowel, invisible
  "\u180B", // Mongolian free variation selector one
  "\u180E", // Mongolian vowel separator
  "\u180F", // Mongolian free variation selector four
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
  "\u2060", // word joiner
  "\u2061", // function application
  "\u2066", // left-to-right isolate
  "\u2067", // right-to-left isolate
  "\u2068", // first strong isolate
  "\u2069", // pop directional isolate
  "\u206A", // inhibit symmetric swapping
  "\u206F", // nominal digit shapes
  "\u3164", // Hangul filler
  "\uFE00", // variation selector one
  "\uFE0F", // variation selector sixteen, the emoji presentation one
  "\uFEFF", // zero-width no-break space, the byte-order mark
  "\uFFA0", // halfwidth Hangul filler
  "\uFFF9", // interlinear annotation anchor
  "\uFFFB", // interlinear annotation terminator
  "\u{1BCA0}", // shorthand format letter overlap
  "\u{1D173}", // musical symbol begin beam
  "\u{E0001}", // language tag, the first of the tag characters
  "\u{E0041}", // a tag spelled as `A`, hiding a word after the address
  "\u{E0100}", // variation selector seventeen, in a surrogate pair
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
    // The matcher ends this match before the byte-order mark rather than
    // carrying it, and stopping is not the safe outcome it looks like.
    // Stopping is how one visible address becomes two links: measured, the
    // same mark inside the host splits it into a link to `https://exa` and
    // a second link to `https://mple.com/a`. So a match the matcher stopped
    // an invisible character at is refused on either side, the mark being
    // no safer behind the address than in front of it.
    const prose = "booked at https://example.com/booking\uFEFF";
    expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
  });

  it("refuses both halves of a split address", () => {
    // The outcome a reader would otherwise get, over the same words: an
    // underline reading `https://example.com/a`, where the first half links
    // to a host that is not the one written and the second half links to a
    // host the author never typed. Whatever survives has to be prose.
    for (const char of ["\uFEFF", "\u200B", "\u202E", "\u2060"]) {
      for (const prose of [
        `see https://exa${char}mple.com/a now`,
        `see https://example.com${char}/a now`,
        `see https://example.com/a${char}b now`,
        `see ${char}https://example.com/a now`,
        `see https://example.com/a${char} now`,
      ]) {
        expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
      }
    }
  });

  it("leaves an address alone when the mark is not next to it", () => {
    // The rule is adjacency, not "somewhere in the paragraph": a mark two
    // words away is not a character the matcher stopped at, so refusing on
    // it would unlink prose for something a reader cannot see.
    const prose = "see https://example.com/a now\uFEFF";
    expect(links(linkedRuns(prose))).toEqual([
      {
        type: "link",
        value: "https://example.com/a",
        href: "https://example.com/a",
      },
    ]);
    expect(shown(linkedRuns(prose))).toBe(prose);
  });

  it("yields no link when an invisible character is in an address", () => {
    // The guard's outcome, stated as an outcome: not "the run is clean" but
    // "nothing here is pressable". A half-address under an underline reads
    // as a whole one, so a refused address has to leave no link behind.
    for (const char of INVISIBLE) {
      for (const prose of [
        `see https://exa${char}mple.com/a now`,
        `see https://example.com/a${char}b now`,
      ]) {
        expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
      }
    }
  });

  it("still links an address that begins a line", () => {
    // The adjacency rule has one exemption and it is load-bearing: `\n`,
    // `\t` and `\r` are inside the C0 block the guard refuses, so a rule
    // that did not exempt whitespace would unlink every address after a
    // line break — which is most of them.
    for (const prose of [
      "https://x.com/a at nine",
      "line\nhttps://x.com/a",
      "line\thttps://x.com/a",
      "line\r\nhttps://x.com/a",
      "line\n\nhttps://x.com/a",
    ]) {
      const runs = linkedRuns(prose);
      expect(links(runs).map((run) => run.value)).toEqual(["https://x.com/a"]);
      expect(shown(runs)).toBe(prose);
    }
  });

  it("links only the schemes a press can follow", () => {
    // `file:` is a dead press on Android, `ftp:` and `mailto:` are the wrong
    // app in the wrong place, and a member's prose is not a launcher. The
    // matcher refuses `javascript:` and `data:` itself; this pins that the
    // allowlist does not lose that while it refuses the rest.
    for (const prose of [
      "open file:///etc/passwd now",
      "open ftp://x.com/a now",
      "write mailto:a@b.com now",
      "go javascript:alert(1) now",
      "go data:text/html,x now",
    ]) {
      expect(linkedRuns(prose)).toEqual([{ type: "text", value: prose }]);
    }

    // And the two that must stay: a written scheme, and the schemeless
    // address a phone author actually types — whose `href` carries the
    // scheme the label does not.
    expect(links(linkedRuns("see https://x.com now"))).toEqual([
      { type: "link", value: "https://x.com", href: "https://x.com" },
    ]);
    expect(links(linkedRuns("see booking.com now"))).toEqual([
      { type: "link", value: "booking.com", href: "https://booking.com" },
    ]);
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

  it("keeps a link whole when the cut lands right after it", () => {
    // The kept part ends on a link: the `…` must arrive as its own run and
    // the link must keep the label it goes to. Trimming the label is how a
    // press starts lying — `booking.co` going to `booking.com`.
    const prose = "book on booking.com " + "y".repeat(50);
    const end = "book on booking.com".length;
    const { runs } = truncateRuns(linkedRuns(prose), end);
    expect(runs).toEqual([
      { type: "text", value: "book on " },
      { type: "link", value: "booking.com", href: "https://booking.com" },
      { type: "text", value: "…" },
    ]);
    expect(shown(runs)).toBe("book on booking.com…");
  });

  it("never gives a link a label it does not go to", () => {
    // The same rule at the unit the bug was in. A link run is kept or
    // dropped, never rebuilt: `trimEnd` on a label would hand the press a
    // shorter word than the href behind it, which is the one thing this
    // module exists to prevent. The trailing space is not something
    // linkifyjs emits — it is the shape of the input the bug was in, and
    // `runs` is a public prop on `LinkedText`, so a caller can hand it one.
    const cut = truncateRuns(
      [
        { type: "link", value: "booking.com  ", href: "https://booking.com" },
        { type: "text", value: "and the rest of the sentence" },
      ],
      "booking.com  ".length,
    );
    expect(cut.runs).toEqual([
      { type: "link", value: "booking.com  ", href: "https://booking.com" },
      { type: "text", value: "…" },
    ]);
  });

  it("re-cuts an over-limit run to the same runs, mark and all", () => {
    // What this proves, and no more: the cut runs of a description still
    // over the limit cut the same way twice, so a renderer that re-reads
    // them does not stack ellipses. It does not prove the flag survives a
    // second cut — nothing would, see the test below.
    const once = truncateRuns(linkedRuns("a".repeat(200)), 160);
    const twice = truncateRuns(once.runs, 160);
    expect(twice.runs).toEqual(once.runs);
    expect(twice.truncated).toBe(true);
  });

  it("calls the first cut a cut and a second cut of it nothing", () => {
    // 184 characters. The cut takes the first 160, the 30 spaces in it burn
    // the budget and the trim deletes them, so 151 survive — inside the
    // limit. The first pass is a cut and says so; a second pass over its own
    // output is not a supported input, and reports false. Pinned rather than
    // fixed, because no call site re-cuts and a flag that lied on the first
    // pass would be the worse contract.
    const prose = "a".repeat(150) + " ".repeat(30) + "tail";
    const once = truncateRuns(linkedRuns(prose), 160);
    expect(once.truncated).toBe(true);
    expect(shown(once.runs)).toBe("a".repeat(150) + "…");

    const twice = truncateRuns(once.runs, 160);
    expect(twice.runs).toEqual(once.runs);
    expect(twice.truncated).toBe(false);
  });

  it("never cuts between the halves of a surrogate pair", () => {
    // `"🌴".repeat(100)` is 200 UTF-16 units for 100 characters, and 161 is
    // an odd cut: the 161st unit is the high half of the 81st palm. Half a
    // pair renders as `�`, so the unit goes with its pair and the text stops
    // one unit earlier.
    const { runs } = truncateRuns(linkedRuns("🌴".repeat(100)), 161);
    const visible = shown(runs);
    expect(visible).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(visible).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(visible).toBe("🌴".repeat(80) + "…");
  });
});
