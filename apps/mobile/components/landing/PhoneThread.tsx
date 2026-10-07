import { Link } from "expo-router";
import { Text, View } from "react-native";

/**
 * The sample message: one SMS from the service, not a conversation.
 *
 * A complete device in our own system, not a platform facsimile: a
 * hard-edged ink frame around a paper ground (a rectangle, never a
 * rounded bezel), a quiet status bar of mono marks, our app header, a
 * centred date separator, the one message, and the composer. Square
 * corners everywhere, Space Mono throughout, our palette — if it starts
 * to read as an Android screenshot rather than our page, that is the
 * failure mode, and the fix is to pull it back here.
 *
 * The words are the API's verbatim template, not marketing copy
 * (`apps/api/src/services/invitation.service.ts:688` — the same string
 * at :696, :715 and :723): the inviter and trip read live from the demo
 * fixture, and the URL carries the demo's own invitation id, so the
 * string is real all the way down. The break sits exactly on the `?` —
 * a deliberate boundary, never a mid-word wrap.
 *
 * Two deliberate deviations, both stated here:
 *
 *   - The monogram initial is `font-body-bold`, not the display face.
 *     The display floor (`design-lint.mjs` check 4) starts at 28px, and
 *     a monogram at that size would dominate the message rather than
 *     head it. The initial is a label, so it takes the label's voice.
 *   - The boxes below use bare `border` (the control's own edge), never
 *     a side token — so the rule census does not move for them. If a
 *     bordered box ever needs a side, that is a fourth rank and a person
 *     decides it; see `scripts/design-lint.mjs` check 11. The date
 *     separator is centred text with no drawn line for the same reason.
 *
 * Honest to assistive tech by construction. The bubble's link is the
 * block's ONLY focusable control, and everything that merely looks like
 * a device is hidden from assistive tech on both surfaces (`aria-hidden`
 * for the web export, `accessible={false}` for native): the frame, the
 * status bar, the header, the monogram, the date separator, the composer
 * and its send button. The template prose stays exposed — it is text a
 * reader needs, not chrome — so a screen reader hears the message and
 * one link, and is never offered a field that does nothing. `aria-hidden`
 * must stay off every ancestor of the link, or the link goes with it.
 */
export function PhoneThread({
  dayLabel,
  messageText,
  linkLabel,
  href,
}: {
  /** The centred date separator, e.g. "Wednesday, Nov 4". */
  dayLabel: string;
  /**
   * The invite's first line, verbatim from the API template —
   * `{name} invited you to "{trip}" on Journiful!` — read live from the
   * demo fixture.
   */
  messageText: string;
  /**
   * The invite URL as plain text with its line break on the `?`, e.g.
   * `https://journiful.app/invite` + newline + `?id=demo-invitation-cabo`.
   */
  linkLabel: string;
  /** Where the link goes — the demo trip the invitation opens. */
  href: string;
}) {
  return (
    <View className="w-full border-2 border-ink bg-paper px-4 pb-4 pt-2">
      {/* Status bar: quiet mono marks, a wink rather than a screenshot —
          the time on the left, one small mark on the right. Decorative. */}
      <View
        aria-hidden
        accessible={false}
        className="flex-row items-center justify-between py-1"
      >
        <Text className="font-body text-xs text-ink">9:41</Text>
        <View className="h-2 w-2 bg-ink" />
      </View>

      {/* App header: our monogram and Journiful. No back arrow, no call
          icons — those would advertise features this page is not showing.
          Decorative. */}
      <View
        aria-hidden
        accessible={false}
        className="flex-row items-center gap-2 py-2"
      >
        <View className="h-8 w-8 items-center justify-center bg-ink">
          <Text className="font-body-bold text-sm text-paper">J</Text>
        </View>
        <Text className="font-body-bold text-sm text-ink">Journiful</Text>
      </View>

      {/* Date separator: quiet and centred, the way the reference's
          "Wednesday, Nov 4" works. Text only, no drawn line.
          Decorative. */}
      <Text
        aria-hidden
        accessible={false}
        className="py-1 text-center font-body text-xs text-grey-quiet"
      >
        {dayLabel}
      </Text>

      {/* The invitation: the template's first line, then the URL as plain
          text on its own lines — underlined ocean-deep, tappable, broken
          only on the `?`. The link is the band's one action. */}
      <View className="gap-1 border border-ink bg-gravel px-3 py-2">
        <Text className="font-body text-base leading-snug text-ink">
          {messageText}
        </Text>
        <Link
          href={href}
          className="font-body text-base text-ocean-deep underline"
        >
          {linkLabel}
        </Link>
      </View>

      {/* The composer: a square ink-bordered field with the muted
          placeholder and a square send button on the right. Decorative,
          like everything that is not the link: hidden, never focusable,
          never a field that does nothing. */}
      <View
        aria-hidden
        accessible={false}
        className="flex-row items-center gap-2 pt-3"
      >
        <View className="flex-1 border border-ink bg-paper px-3 py-2">
          <Text className="font-body text-base text-grey-quiet">
            jMessage
          </Text>
        </View>
        <View className="h-9 w-9 items-center justify-center bg-ink">
          <Text className="font-body-bold text-base text-paper">↑</Text>
        </View>
      </View>
    </View>
  );
}
