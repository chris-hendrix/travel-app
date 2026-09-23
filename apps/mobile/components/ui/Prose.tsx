import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { InlineAction } from "@/components/ui/InlineAction";
import { documentBlocks, parseInline } from "@journiful/shared/legal";
import type { LegalDocument, MarkdownBlock } from "@journiful/shared/legal";

/**
 * Long-form prose: the one place in the system where a paragraph is the
 * content rather than a label on something else.
 *
 * The document arrives as Markdown — the copy is written and edited by
 * people, so it is stored as the thing a person would read — and this
 * is the only component that turns that into type. Headings take the
 * display face, because a heading is a short string and short strings
 * are all the display face is for. The body takes the body face at a
 * size that survives a screenful of it. Links are `InlineAction`: bold
 * and underlined, in ink, like every other pressable word in the system
 * that has no box to say so. They were underlined and *not* bold here,
 * which was drift rather than a decision — the note above them only ever
 * justified the colour.
 */
export function Prose({
  document,
  onLink,
}: {
  document: LegalDocument;
  onLink?: ((href: string) => void) | undefined;
}) {
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="font-display text-4xl uppercase leading-none text-ink">
          {document.title}
        </Text>
        <Text className="font-body-italic text-sm text-ink">
          {document.effective
            ? `Last updated: ${document.lastUpdated} · Effective: ${document.effective}`
            : `Last updated: ${document.lastUpdated}`}
        </Text>
      </View>

      {/* Markdown has no section node, so a heading is a block with air
          above it rather than a wrapper — which is also why the breathing
          room is on the heading instead of in a container. */}
      {documentBlocks(document).map((block, index) => (
        <Block key={index} block={block} onLink={onLink} />
      ))}
    </View>
  );
}

function Block({
  block,
  onLink,
}: {
  block: MarkdownBlock;
  onLink?: ((href: string) => void) | undefined;
}) {
  if (block.kind === "heading") {
    return (
      <Text className="mt-4 font-display text-xl uppercase leading-tight text-ink">
        {block.text}
      </Text>
    );
  }

  if (block.kind === "paragraph") {
    return (
      <Text className="font-body text-base leading-relaxed text-ink">
        {runsOf(block.text, onLink)}
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {block.items.map((item, index) => (
        <View key={index} className="flex-row gap-3">
          {/* A mark in its own column, so a wrapped item lines up under
              its first word instead of under the bullet. */}
          <Text className="font-body text-base leading-relaxed text-ink">
            •
          </Text>
          <Text className="flex-1 font-body text-base leading-relaxed text-ink">
            {runsOf(item, onLink)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * One marked-up string to runs. Emphasis is a nested `Text` — which is
 * how the platform inherits the paragraph's size and line height rather
 * than restating them — and a link is a nested `Text` that happens to be
 * pressable.
 */
function runsOf(
  markup: string,
  onLink?: ((href: string) => void) | undefined,
): ReactNode[] {
  return parseInline(markup).map((run, index) => {
    if (run.kind === "strong") {
      return (
        <Text key={index} className="font-body-bold">
          {run.value}
        </Text>
      );
    }

    if (run.kind === "link") {
      return (
        <InlineAction
          key={index}
          label={run.label}
          onPress={() => onLink?.(run.href)}
        />
      );
    }

    return run.value;
  });
}
