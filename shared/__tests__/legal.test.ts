import { describe, expect, it } from "vitest";
import {
  LEGAL_DOCUMENTS,
  SUPPORT_EMAIL,
  documentBlocks,
  documentHrefs,
  legalDocument,
  parseInline,
  parseMarkdown,
} from "../legal/index.js";
import type { LegalInline, MarkdownBlock } from "../legal/index.js";

/** The text a reader sees, with the marks taken back out. */
function plain(runs: LegalInline[]): string {
  return runs
    .map((run) => (run.kind === "link" ? run.label : run.value))
    .join("");
}

/** Everything a reader sees, in order, whichever block it sits in. */
function readable(blocks: MarkdownBlock[]): string[] {
  return blocks.flatMap((block) =>
    block.kind === "heading"
      ? [block.text]
      : block.kind === "paragraph"
        ? [plain(parseInline(block.text))]
        : block.items.map((item) => plain(parseInline(item))),
  );
}

function headings(blocks: MarkdownBlock[]): string[] {
  return blocks.flatMap((block) =>
    block.kind === "heading" ? [block.text] : [],
  );
}

describe("parseMarkdown", () => {
  it("reads a paragraph and rejoins where the source wrapped it", () => {
    expect(parseMarkdown("Message frequency varies\nbased on trip activity.")).toEqual([
      { kind: "paragraph", text: "Message frequency varies based on trip activity." },
    ]);
  });

  it("reads a heading", () => {
    expect(parseMarkdown("## Opt-Out")).toEqual([
      { kind: "heading", text: "Opt-Out" },
    ]);
  });

  it("collects consecutive bullets into one list", () => {
    expect(parseMarkdown("- Reply STOP\n- Reply HELP")).toEqual([
      { kind: "list", items: ["Reply STOP", "Reply HELP"] },
    ]);
  });

  it("continues a bullet that the source wrapped", () => {
    expect(
      parseMarkdown(
        "- **Legal requirements** — when required by law,\n  regulation, or legal process",
      ),
    ).toEqual([
      {
        kind: "list",
        items: ["**Legal requirements** — when required by law, regulation, or legal process"],
      },
    ]);
  });

  it("starts a new block at a blank line, and at a heading", () => {
    expect(parseMarkdown("First.\n\nSecond.\n## Heading\nBody.")).toEqual([
      { kind: "paragraph", text: "First." },
      { kind: "paragraph", text: "Second." },
      { kind: "heading", text: "Heading" },
      { kind: "paragraph", text: "Body." },
    ]);
  });

  it("closes a list when the prose resumes", () => {
    expect(parseMarkdown("- one\n\nAfter the list.")).toEqual([
      { kind: "list", items: ["one"] },
      { kind: "paragraph", text: "After the list." },
    ]);
  });

  it("returns nothing for an empty body", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("returns one run for text that carries no marks", () => {
    expect(parseInline("Message and data rates may apply.")).toEqual([
      { kind: "text", value: "Message and data rates may apply." },
    ]);
  });

  it("reads bold inside a sentence", () => {
    const runs = parseInline("Reply **STOP** to unsubscribe.");
    expect(plain(runs)).toBe("Reply STOP to unsubscribe.");
    expect(runs).toContainEqual({ kind: "strong", value: "STOP" });
  });

  it("reads a link and keeps its label and target", () => {
    expect(parseInline("see our [Privacy Policy](/privacy).")).toContainEqual({
      kind: "link",
      label: "Privacy Policy",
      href: "/privacy",
    });
  });

  it("reads a bold run and a link in the same string", () => {
    const runs = parseInline(
      "We do **not** sell it, and [the policy](/privacy) says so.",
    );
    expect(plain(runs)).toBe("We do not sell it, and the policy says so.");
    expect(runs.filter((run) => run.kind !== "text")).toHaveLength(2);
  });

  it("keeps a bold run that opens the string", () => {
    expect(parseInline("**Phone number** — used to sign in")[0]).toEqual({
      kind: "strong",
      value: "Phone number",
    });
  });
});

describe("the documents", () => {
  it("covers the three documents the apps link to, in reading order", () => {
    expect(LEGAL_DOCUMENTS.map((document) => document.id)).toEqual([
      "terms",
      "privacy",
      "sms-terms",
    ]);
  });

  it("publishes each document at its own id", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.route).toBe(`/${document.id}`);
      expect(legalDocument(document.id)).toBe(document);
    }
  });

  it("carries the version a consent record is checked against", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.title.trim().length).toBeGreaterThan(0);
      expect(document.lastUpdated).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
      if (document.effective !== undefined) {
        expect(document.effective).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
      }
    }
  });

  it("reads as sections, and never as an empty one", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const blocks = documentBlocks(document);

      expect(headings(blocks).length).toBeGreaterThan(0);
      expect(blocks.some((block) => block.kind === "paragraph")).toBe(true);

      for (const block of blocks) {
        const texts = block.kind === "list" ? block.items : [block.text];
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
          expect(text.trim().length).toBeGreaterThan(0);
          // A mark that reached the reader is a mark that was mistyped.
          expect(plain(parseInline(text))).not.toContain("**");
        }
      }
    }
  });

  it("numbers its sections apart, so nothing is repeated", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const found = headings(documentBlocks(document));
      expect(new Set(found).size).toBe(found.length);
    }
  });

  it("only points at the support address, a sibling document, or nothing", () => {
    const routes = LEGAL_DOCUMENTS.map((document) => document.route);

    for (const document of LEGAL_DOCUMENTS) {
      const hrefs = documentHrefs(document);
      expect(hrefs.length).toBeGreaterThan(0);

      for (const href of hrefs) {
        if (href.startsWith("mailto:")) {
          expect(href).toBe(`mailto:${SUPPORT_EMAIL}`);
        } else {
          expect(routes).toContain(href);
        }
      }
    }
  });

  it("links each document to at least one other", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const internal = documentHrefs(document).filter((href) =>
        href.startsWith("/"),
      );
      expect(internal.length).toBeGreaterThan(0);
    }
  });

  it("has nothing left over once the body is read", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(readable(documentBlocks(document)).join(" ")).not.toContain("**");
    }
  });
});
