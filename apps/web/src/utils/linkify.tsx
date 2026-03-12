import type { ReactNode } from "react";

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

// Punctuation that commonly trails a URL in prose but isn't part of it
const TRAILING_PUNCT = /[.,;:!?)]+$/;

interface UrlMatch {
  url: string;
  index: number;
}

export function linkifyText(text: string): ReactNode[] {
  const matches: UrlMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = URL_REGEX.exec(text)) !== null) {
    let url = match[0];
    const index = match.index;

    // Strip trailing punctuation that's likely not part of the URL
    const trailingMatch = TRAILING_PUNCT.exec(url);
    if (trailingMatch) {
      url = url.slice(0, -trailingMatch[0].length);
    }

    matches.push({ url, index });
  }

  if (matches.length === 0) {
    return [text];
  }

  const result: ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const { url, index } = m;

    // Text before this URL
    if (index > lastIndex) {
      result.push(text.slice(lastIndex, index));
    }

    result.push(
      <a
        key={i}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        {url}
      </a>,
    );

    lastIndex = index + url.length;
  }

  // Text after last URL
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}
