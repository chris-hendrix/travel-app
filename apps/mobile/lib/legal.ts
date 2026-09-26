import { LEGAL_DOCUMENTS } from "@journiful/shared/legal";
import type { LegalDocumentId } from "@journiful/shared/legal";

/**
 * Where the published documents live in this app.
 *
 * The screens sit at the published paths (/terms, /privacy,
 * /sms-terms) — the copy's own internal hrefs are already those
 * addresses (`shared/legal/privacy.ts`), so the mapping is identity
 * and there is no alias layer.
 */
export const LEGAL_ROUTE: Record<LegalDocumentId, string> = {
  terms: "/terms",
  privacy: "/privacy",
  "sms-terms": "/sms-terms",
};

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
