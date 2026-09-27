import { Text, View } from "react-native";

/**
 * The linked place, shown under the field that picked it.
 *
 * The field can only carry one of the two strings — a stay's Address
 * holds the formatted address, an event's Place holds the name — so
 * until now the pick was only ever half visible, and the two forms
 * disagreed about which half. This renders both, in the order the
 * picker row showed them, so what is linked is legible at a glance
 * rather than inferred from one of its parts.
 *
 * Renders nothing when there is neither a name nor an address: typed
 * prose has no place, and a block of blank lines would read as a place
 * that failed to load. The address is genuinely absent for a moment
 * after a pick, because it arrives with the details lookup — the name
 * shows first, and the second line appears when it lands.
 *
 * The left rule marks it as an annotation on the field above rather
 * than another input; nothing here is editable.
 *
 * One line, not two: the name leads in bold and the address follows
 * lighter, the same reading as the picker row it came from. A second
 * line would push the rest of the form down for information the eye
 * takes in at a glance anyway.
 */
export function PickedPlace({
  name,
  address,
}: {
  name: string | null;
  address: string | null;
}) {
  const trimmedName = name?.trim() ?? "";
  const trimmedAddress = address?.trim() ?? "";
  if (!trimmedName && !trimmedAddress) return null;

  return (
    <View className="border-l-2 border-gravel pl-3">
      <Text className="font-body text-base text-ink/70">
        {trimmedName ? (
          <Text className="font-body-bold text-ink">{trimmedName}</Text>
        ) : null}
        {trimmedName && trimmedAddress ? " " : null}
        {trimmedAddress}
      </Text>
    </View>
  );
}
