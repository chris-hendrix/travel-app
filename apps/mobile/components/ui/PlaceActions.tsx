import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { QuietAction } from "@/components/ui/QuietAction";
import { placeCopyText, placeMapsUrl } from "@/lib/links";

/**
 * How long the copy verb stays answered. Long enough to read the word, short
 * enough that nobody presses it twice wondering whether it took.
 */
const COPIED_MS = 2000;

/**
 * The two verbs a place has, side by side: leave for Maps, or take the
 * address with you.
 *
 * One component because they are one decision read twice — what lands on the
 * clipboard is the string the link searches — and because a pair that has to
 * agree about which string that is will disagree the moment it is written
 * out twice. `placeMapsUrl` pins the link to the linked place when there is
 * one and searches the address otherwise; the copy takes the address itself
 * (`placeCopyText`), falling back to the name for a place that has only one
 * — a typed place, and a travel where, which files the provider's whole
 * reading in one string. The copy names what it takes (`Copy address` where
 * there is one, plain `Copy` where there is only a name), because the verb
 * is the whole of what the press promises. Neither string is invented here:
 * the caller hands over the snapshots it already shows in its own Where
 * block, and a place with neither a name nor an address draws nothing.
 *
 * The copy answers by inverting itself — `Copied`, for two seconds — rather
 * than by a message. That is the lab's feedback rule, and it is the only
 * answer a clipboard gets to give: nothing on the screen changes when a
 * string lands on a clipboard, so the word that took it is the whole of the
 * state. `Copied` also replaces `Copy address` rather than sitting beside
 * it, because the word is the control.
 *
 * Two words in one row is the shape `app/trips/edit.tsx`'s cover pair
 * already uses, and neither word carries a box: an underline is the only
 * mark either has, which is what a secondary action is in this system.
 */
export function PlaceActions({
  name,
  address,
  placeId,
}: {
  /** What the screen calls the place: the picker row's own name snapshot. */
  name?: string | null | undefined;
  /** The address as the provider gave it, when there is one to hand over. */
  address?: string | null | undefined;
  /** The linked Google place id, which pins the Maps link when present. */
  placeId?: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const label = name?.trim() || address?.trim() || "";
  if (label === "") return null;
  const where = address?.trim() || "";

  return (
    <View className="flex-row items-center gap-5">
      <QuietAction
        label="Open in Maps"
        ariaLabel={`Open ${label} in Google Maps`}
        onPress={() =>
          void Linking.openURL(placeMapsUrl(placeId, where || label))
        }
      />
      <QuietAction
        label={copied ? "Copied" : where ? "Copy address" : "Copy"}
        ariaLabel={where ? `Copy ${label} address` : `Copy ${label}`}
        onPress={() => {
          void Clipboard.setStringAsync(placeCopyText(label, address)).then(
            () => setCopied(true),
            // Nothing was copied, so nothing is confirmed: the word stays as
            // it was, which is the answer a read that never landed gets.
            () => setCopied(false),
          );
        }}
      />
    </View>
  );
}
