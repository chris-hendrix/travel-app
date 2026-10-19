import { Linking, View } from "react-native";
import { QuietAction } from "@/components/ui/QuietAction";
import { useCopied } from "@/hooks/useCopied";
import { placeCopyText, placeMapsUrl } from "@/lib/links";

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
 * The copy answers through `useCopied` — `Copied`, for two seconds — and
 * that hook is where the beat and the reason for an invert live. `Copied`
 * replaces `Copy address` rather than sitting beside it, because the word is
 * the control.
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
  const { copied, copy } = useCopied();

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
        onPress={() => copy(placeCopyText(label, address))}
      />
    </View>
  );
}
