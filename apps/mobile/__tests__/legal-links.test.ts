import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, documentHrefs } from "@journiful/shared/legal";
import { BARE_HEADER_ROUTES, DIALOG_ROUTES } from "@/lib/routes";
import { LEGAL_ROWS, legalTarget } from "@/lib/legal";

/**
 * The copy is shared with the web, and its cross-links are written as
 * the web addresses the documents are published at. This is what holds
 * the app to being able to open every one of them.
 */
describe("legal copy, as this app renders it", () => {
  it("has a screen for every document", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(DIALOG_ROUTES).toContain(legalTarget(document.route));
    }
  });

  it("has a screen for every link inside the copy", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const internal = documentHrefs(document).filter((href) =>
        href.startsWith("/"),
      );
      expect(internal.length).toBeGreaterThan(0);

      for (const href of internal) {
        expect(DIALOG_ROUTES).toContain(legalTarget(href));
      }
    }
  });

  it("leaves support mail to the mail client", () => {
    expect(legalTarget("mailto:support@journiful.com")).toBe(
      "mailto:support@journiful.com",
    );
  });

  it("lists every document on the profile, each on a dialog route", () => {
    expect(LEGAL_ROWS.map((row) => row.title)).toEqual(
      LEGAL_DOCUMENTS.map((document) => document.title),
    );

    const hrefs = LEGAL_ROWS.map((row) => row.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(DIALOG_ROUTES).toContain(href);
  });

  it("keeps the landing, and only the landing, without person chrome", () => {
    expect(BARE_HEADER_ROUTES).toEqual(["/"]);
  });
});
