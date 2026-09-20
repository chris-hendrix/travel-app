import type { LegalInline, MarkdownBlock } from "./types";

/**
 * The markup the documents are written in, and the whole of it:
 *
 *   ## Heading          a section
 *   - item              a bullet (a wrapped item continues on the next
 *                       line, as in Markdown)
 *   **bold**            emphasis
 *   [label](href)       a link
 *
 * Everything else is a paragraph, and paragraphs rejoin where the
 * source wraps them.
 *
 * A general Markdown engine was considered and passed over: these three
 * documents use four constructs, and a renderer that brought its own
 * idea of headings, lists and links would be fighting the design system
 * for control of every size on the page. If the copy ever grows past
 * this subset, the subset is what should grow — under test, deliberately
 * — rather than the pages quietly acquiring a second typographer.
 */

const HEADING = /^##\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

/** `**bold**` and `[label](href)`. */
const MARKS = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

/** A body to blocks. Blank lines separate; anything else continues the
 *  block it is standing in. */
export function parseMarkdown(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ kind: "list", items: list });
    list = [];
  };

  for (const raw of body.split("\n")) {
    const line = raw.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: heading[1]! });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]!);
      continue;
    }

    // Neither a new block nor blank: it belongs to whatever is open.
    if (list.length > 0) {
      const last = list.length - 1;
      list[last] = `${list[last]} ${line}`;
    } else {
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}

/**
 * A marked-up string to runs. A platform renders runs and never parses,
 * so this is the one place the marks mean anything.
 */
export function parseInline(markup: string): LegalInline[] {
  const runs: LegalInline[] = [];
  let cursor = 0;

  for (const match of markup.matchAll(MARKS)) {
    const at = match.index;
    if (at > cursor) {
      runs.push({ kind: "text", value: markup.slice(cursor, at) });
    }

    const strong = match[1];
    if (strong !== undefined) {
      runs.push({ kind: "strong", value: strong });
    } else {
      runs.push({ kind: "link", label: match[2]!, href: match[3]! });
    }

    cursor = at + match[0].length;
  }

  if (cursor < markup.length) {
    runs.push({ kind: "text", value: markup.slice(cursor) });
  }

  return runs;
}

/** Every string a block carries, whichever shape it is. */
export function blockTexts(block: MarkdownBlock): string[] {
  return block.kind === "list" ? block.items : [block.text];
}
