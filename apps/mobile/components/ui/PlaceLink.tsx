import { Linking, Pressable, Text, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { mapsSearchUrl } from "@/lib/maps";

/**
 * A place you can leave the app for.
 *
 * The system's link is underlined ink text — a quiet action — and this
 * is that plus an arrow, because this one does more than move within the
 * app: it hands off to Google Maps, which is why it says so before it is
 * pressed rather than after.
 *
 * The label and the query are separate on purpose. The label is what the
 * screen calls the place; the query is what Maps should search for,
 * which is the place plus the trip it is on, so that a restaurant name
 * lands on the restaurant.
 */
export function PlaceLink({
  label,
  query,
}: {
  label: string;
  /** What to search for. Defaults to the label. */
  query?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        // Web opens a tab, native hands off to the OS — the same call,
        // which is why this component needs no platform branch.
        void Linking.openURL(mapsSearchUrl(query ?? label));
      }}
      aria-label={`Open ${label} in Google Maps`}
      className="cursor-pointer self-start"
    >
      <View className="flex-row items-center gap-1">
        <Text className="font-body-bold text-lg text-ink underline">
          {label}
        </Text>
        <ArrowUpRight color="#000000" size={18} />
      </View>
    </Pressable>
  );
}
