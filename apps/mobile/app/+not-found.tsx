import { Link } from "expo-router";
import { Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { useHeaderTone } from "@/lib/headerTone";

/**
 * Where an address with no screen lands.
 *
 * Production only in practice: on the web every exported route exists,
 * and inside the app the links are all hand-written, so this is the page
 * for a typed address and a stale deep link rather than for navigation.
 * The lab answers with this too, outside the development build.
 */
export default function NotFound() {
  useHeaderTone("baltic");
  return (
    <Screen>
      {/* An empty state, so it is a band: `display-sm` 32px caps with the
          body face under it, the treatment every empty state in this app
          wears. The heading was `display-md` before this — bigger than the
          thing it was announcing, for a screen that is a dead end. */}
      <Band tone="baltic">
        <Column lead>
        <View className="gap-3">
          <Text className="font-display-bold text-display-sm uppercase text-ink">
            Nothing here
          </Text>
          <Text className="font-body text-body leading-snug text-ink">
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
        </Column>
      </Band>
    </Screen>
  );
}
