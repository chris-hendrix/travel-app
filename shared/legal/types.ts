/**
 * The published legal documents.
 *
 * Each one is metadata plus a body written in Markdown, because the
 * copy is read and edited by people: the body should look like the
 * document, diff like the document, and be proofreadable against
 * journiful.app/privacy line for line. What it deliberately is *not* is
 * a structure of typed nodes — a policy chopped into object literals is
 * a policy nobody can check.
 *
 * The copy lives in the shared package rather than in either app's
 * renderer because it is the one artifact that must read identically on
 * every platform, and it has to outlive the web app: the store listing
 * points at a public URL, and the app shows the same text at the moment
 * of consent. Two hand-written copies would drift, and a privacy policy
 * that drifts is a compliance problem rather than a cosmetic one.
 */

/**
 * Where support mail goes. One constant, so that no document can
 * disagree with the address printed beside it.
 *
 * Deliberately `.com` while the product's domain is `journiful.app`:
 * this matches the copy published at journiful.app/privacy, which is
 * the URL the Play listing hands reviewers. Changing it is a two-place
 * change — here and the web pages — not a typo fix.
 */
export const SUPPORT_EMAIL = "support@journiful.com";

/** Matches the document's own web path, so an id is also a route. */
export type LegalDocumentId = "terms" | "privacy" | "sms-terms";

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  /**
   * The address this document is published at on the web. Links inside
   * the body are written as those addresses, and each app maps them onto
   * its own routes — so the copy stays platform-agnostic, and a link is
   * never quietly re-pointed by whichever platform renders it.
   */
  route: string;
  lastUpdated: string;
  /** Omitted by a document that has only ever had one version. */
  effective?: string;
  /** Metadata above is for machines; this is for readers. */
  body: string;
}

/** A run of text inside a paragraph. */
export type LegalInline =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "link"; label: string; href: string };

/** What a body becomes once it is read. */
export type MarkdownBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };
