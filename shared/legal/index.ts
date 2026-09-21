import { blockTexts, parseInline, parseMarkdown } from "./markdown";
import { privacy } from "./privacy";
import { smsTerms } from "./smsTerms";
import { terms } from "./terms";
import type { LegalDocument, LegalDocumentId, MarkdownBlock } from "./types";

export * from "./types";
export { parseInline, parseMarkdown } from "./markdown";

/**
 * In the order a reader meets them: what you agreed to, what we do with
 * your data, then the rules of the text-message program.
 */
export const LEGAL_DOCUMENTS: LegalDocument[] = [terms, privacy, smsTerms];

export function legalDocument(id: LegalDocumentId): LegalDocument {
  const found = LEGAL_DOCUMENTS.find((document) => document.id === id);
  // Exhaustive by construction: the id type is the list's own ids.
  if (!found) throw new Error(`No legal document named "${id}"`);
  return found;
}

/** A body, read. The screen renders this; nothing else parses. */
export function documentBlocks(document: LegalDocument): MarkdownBlock[] {
  return parseMarkdown(document.body);
}

/**
 * Every href the copy points at, in reading order.
 *
 * An app has to be able to open each one — a route it knows, or a mail
 * client — so this is what a test walks to prove the documents contain
 * no link to nowhere.
 */
export function documentHrefs(document: LegalDocument): string[] {
  return documentBlocks(document)
    .flatMap(blockTexts)
    .flatMap(parseInline)
    .flatMap((run) => (run.kind === "link" ? [run.href] : []));
}
