import { LEGAL_DOCUMENTS } from "@journiful/shared/legal";
import type { LegalDocumentId } from "@journiful/shared/legal";

/**
 * Where the published documents live in this app.
 *
 * The copy writes its cross-links as the web addresses it is published
 * at, so the same text renders on every platform without either app
 * rewriting the words. This is the one place those addresses become
 * routes — and `legal-links.test.ts` walks every link in every document
 * to prove each one still lands on a screen that exists.
 */
export const LEGAL_ROUTE: Record<LegalDocumentId, string> = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  "sms-terms": "/legal/sms-terms",
};

/**
 * An in-app route for a document link, or the href unchanged when it
 * leaves the app. Support mail is the only one that leaves.
 */
export function legalTarget(href: string): string {
  const document = LEGAL_DOCUMENTS.find((each) => each.route === href);
  return document ? LEGAL_ROUTE[document.id] : href;
}

const SHORT_LABEL: Record<LegalDocumentId, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  "sms-terms": "SMS Terms",
};

/**
 * The documents as they are listed. The title is the document's own, so
 * a rename cannot leave the row saying something the page does not; the
 * short form is for the landing's foot, where the three of them share
 * one line the way the web footer's do.
 */
export const LEGAL_ROWS: Array<{
  title: string;
  short: string;
  href: string;
}> = LEGAL_DOCUMENTS.map((document) => ({
  title: document.title,
  short: SHORT_LABEL[document.id],
  href: LEGAL_ROUTE[document.id],
}));
