import { Link } from "expo-router";
import { Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";

/**
 * Where an address with no screen lands.
 *
 * Production only in practice: on the web every exported route exists,
 * and inside the app the links are all hand-written, so this is the page
 * for a typed address and a stale deep link rather than for navigation.
 * The lab answers with this too, outside the development build.
 */
export default function NotFound() {
  return (
    <Screen lead>
      <View className="gap-3">
        <Text className="font-display text-4xl uppercase leading-none text-ink">
          Nothing here
        </Text>
        <Text className="font-body text-base leading-snug text-ink">
          This address has no screen. It was mistyped, or the thing it
          named is gone.
        </Text>
      </View>
      <View>
        <Link
          href="/"
          className="font-body-bold text-base text-ink underline"
        >
          Go to Journiful
        </Link>
      </View>
    </Screen>
  );
}
