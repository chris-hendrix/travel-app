import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, documentHrefs } from "@journiful/shared/legal";
import { BARE_HEADER_ROUTES, DIALOG_ROUTES } from "@/lib/routes";
import { LEGAL_ROWS, LEGAL_ROUTE } from "@/lib/legal";

/**
 * The copy is shared with the web, and its cross-links are written as
 * the web addresses the documents are published at. The screens sit at
 * those same paths, so every link is asserted directly — there is no
 * mapping layer to hold the app to.
 */
describe("legal copy, as this app renders it", () => {
  it("has a screen for every document, at its published path", () => {
    expect(LEGAL_ROWS.map((r) => r.href)).toEqual([
      "/terms",
      "/privacy",
      "/sms-terms",
    ]);
    for (const document of LEGAL_DOCUMENTS) {
      expect(DIALOG_ROUTES).toContain(document.route);
      expect(LEGAL_ROUTE[document.id]).toBe(document.route);
    }
  });

  it("has a screen for every link inside the copy", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const internal = documentHrefs(document).filter((href) =>
        href.startsWith("/"),
      );
      expect(internal.length).toBeGreaterThan(0);

      for (const href of internal) {
        expect(DIALOG_ROUTES).toContain(href);
      }
    }
  });

  it("leaves support mail to the mail client", () => {
    expect("mailto:support@journiful.com".startsWith("/")).toBe(false);
  });

  it("lists every document on the profile, each on a dialog route", () => {
    expect(LEGAL_ROWS.map((row) => row.title)).toEqual(
      LEGAL_DOCUMENTS.map((document) => document.title),
    );

    const hrefs = LEGAL_ROWS.map((row) => row.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(DIALOG_ROUTES).toContain(href);
  });

  it("keeps the landing, the auth flow, and the invitation bare", () => {
    expect(Object.keys(BARE_HEADER_ROUTES)).toEqual([
      "/",
      "/login",
      "/verify",
      "/complete-profile",
      "/invite",
    ]);
  });
});
