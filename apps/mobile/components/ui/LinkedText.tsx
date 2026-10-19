import { useMemo } from "react";
import { Linking, Text } from "react-native";
import { InlineAction } from "@/components/ui/InlineAction";
import { linkedRuns } from "@/lib/linkify";
import type { ProseRun } from "@/lib/linkify";

/** The paragraph member prose is read in, when the caller names no class. */
const PARAGRAPH = "font-body text-base leading-relaxed text-ink";

type Shared = {
  /**
   * The paragraph's own class, replacing the default rather than adding to
   * it. Given at all, it carries the colour and the leading too.
   */
  className?: string | undefined;
  /**
   * Where a press goes, when the caller has somewhere better than the
   * address itself. Omitted, the address is opened.
   */
  onLink?: ((href: string) => void) | undefined;
};

type LinkedTextProps = Shared &
  ( // The ordinary path: prose, split here.
    | { text: string; runs?: never }
    // Prose that arrives already split, and possibly already cut.
    | { runs: ProseRun[]; text?: never }
  );

/**
 * Member-written prose: what somebody typed into a description, with the
 * addresses in it pressable.
 *
 * **One renderer, and that is the point.** A description is read on more
 * than one screen, and the same words with a pressable address in one
 * place and a dead one in another is the kind of difference nobody can
 * explain to the member who reported it. `lib/linkify.ts` splits the
 * prose; this draws it. Nothing else should.
 *
 * **The mark is `InlineAction`**: ink, bold, underlined — the system's one
 * mark for *this presses and has no box*. No colour, because in this
 * palette a colour is a role and a word inside a sentence is doing
 * neither. Its target is the line the word sits in rather than a 44pt box,
 * which that component documents as a knowing deviation: padding inside a
 * 16pt paragraph pushes the line apart, and a box breaks the sentence.
 *
 * **The label is the address itself.** `booking.com/xyz?ref=4f2` renders as
 * exactly that and not as `booking.com`, because the part a shortened label
 * drops is the part the author chose — often the part that says which
 * booking. Which is also why nobody writes link text here: there is no
 * syntax for it and no prop for it, and the one thing an author does to say
 * "this is a link" is write a link.
 *
 * **`onLink` defaults to following the address**, and this is the opposite
 * of `Prose`, on purpose. `Prose` renders documents whose addresses are
 * ours, so its `onLink` is optional with no default and the shell holding
 * the session decides where they point; a description is member prose, and
 * the whole promise of the underline is that a press goes where the words
 * say. An optional prop with no default would have shipped screens whose
 * links did nothing, and nothing on screen would have said so — a dead link
 * looks exactly like a live one. A caller with somewhere better to send the
 * press passes `onLink`; everybody else gets `Linking.openURL`.
 *
 * **`runs` is for prose that arrives already cut.** A long description is
 * truncated before it renders, and `truncateRuns` demotes a link the cut
 * lands inside back to prose — a press to half an address is worse than no
 * press. Handing this component the cut runs keeps that decision where it
 * was made; handing it the cut *text* would re-split the text and rebuild a
 * link the cut had just withdrawn. `text` is the ordinary path and splits
 * once, memoised, so a re-render is not a re-parse.
 *
 * **Two deviations, both taken knowingly.** No markup beyond the address:
 * no bold, no bullets, no headings, because reading meaning into member
 * prose ends in a description that renders differently from how it was
 * typed, and the address is the only part of it that wants to be pressable.
 * And the matching is fuzzy on purpose: `clip.mov`, `notes.app` and
 * `Rome.it` are a file, an app and a town, and each will render as a link,
 * because `.mov`, `.app` and `.it` are real TLDs and nothing in the string
 * says which reading the author meant. The two mistakes do not cost the
 * same: a stray underline is visible, and the author can undo it by putting
 * a space in; a real address left as prose is a guest who cannot get in. So
 * the wasted tap is the one taken.
 *
 * **No `selectable`, ever, and it is a product decision rather than an
 * omission.** On Android a selectable `Text` is a different native view, and
 * the presses nested inside it stop firing: the links go dead, silently, on
 * one platform only. A description is where a door code and a wifi password
 * live, so the pressure to make it selectable will come back; the answer is
 * a press of its own where a copy is genuinely wanted, not a prop here. It
 * is not in the props at all, which is what makes that answer hold.
 *
 * `className` replaces `PARAGRAPH` rather than merging onto it: the class
 * string is the whole of the paragraph's typography, so a caller that owns
 * its own leading — `Fact`'s rows, a card's aside — says so once instead of
 * fighting a default it cannot remove.
 */
export function LinkedText(props: LinkedTextProps) {
  const { className, onLink } = props;

  // Narrowed on `props`, and not destructured first: the prop is either
  // prose or runs and never both, which is the union's whole point — a
  // destructure makes that inexpressible and leaves a fallback that only
  // papers over it.
  const parsed = useMemo(
    () => (props.runs ? props.runs : linkedRuns(props.text)),
    [props.runs, props.text],
  );
  const follow = onLink ?? openInBrowser;

  return (
    <Text className={className ?? PARAGRAPH}>
      {parsed.map((run, index) =>
        run.type === "link" ? (
          <InlineAction
            key={index}
            label={run.value}
            onPress={() => follow(run.href)}
          />
        ) : (
          run.value
        ),
      )}
    </Text>
  );
}

/** The default press: follow the address out of the app. */
function openInBrowser(href: string) {
  void Linking.openURL(href);
}
