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
 * The Places API requires the app to reference Google's own documents.
 * Terms and Privacy incorporate them; the SMS program document stands
 * alone. The link targets are Google's canonical policy addresses — the
 * app links out rather than carrying copies.
 */
export const GOOGLE_TERMS_URL = "https://policies.google.com/terms";
export const GOOGLE_PRIVACY_URL = "https://policies.google.com/privacy";

export type GoogleAttribution = {
  termsUrl: string;
  privacyUrl: string;
};

/**
 * The Google attribution for a document, or null when the document
 * carries none. Only Terms and Privacy incorporate Google's documents.
 */
export function googleAttributionFor(
  id: LegalDocumentId,
): GoogleAttribution | null {
  if (id === "terms" || id === "privacy") {
    return { termsUrl: GOOGLE_TERMS_URL, privacyUrl: GOOGLE_PRIVACY_URL };
  }
  return null;
}

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
