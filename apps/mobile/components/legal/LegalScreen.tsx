import { Linking, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { LegalDocument } from "@journiful/shared/legal";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineAction } from "@/components/ui/InlineAction";
import { Prose } from "@/components/ui/Prose";
import { googleAttributionFor } from "@/lib/legal";

/**
 * A published document, as a screen.
 *
 * Read-only, so no action bar: a bar with nothing worth pressing is
 * chrome for its own sake. It is reached from the profile — the consent
 * is a person's own — so dismissal falls back there rather than to the
 * trips list.
 *
 * Nothing here reaches the web. The copy is already in the app, and a
 * reader who is mid-consent on the sign-in screen should not lose what
 * they were doing to a browser.
 */
export function LegalScreen({ document }: { document: LegalDocument }) {
  const router = useRouter();
  const google = googleAttributionFor(document.id);

  return (
    <FullscreenDialog title={document.title} dismissHref="/profile">
      <Prose
        document={document}
        onLink={(href) => {
          if (href.startsWith("/")) router.push(href as never);
          else void Linking.openURL(href);
        }}
      />
      {google ? (
        <View className="mt-6 border-t border-gravel pt-4">
          <Text className="font-body text-sm leading-relaxed text-ink/70">
            Place details and photos are provided by the Google Maps
            Platform. Your use of place features is also subject to
            Google's{" "}
            <InlineAction
              label="Terms of Service"
              onPress={() => void Linking.openURL(google.termsUrl)}
            />
            {" "}and{" "}
            <InlineAction
              label="Privacy Policy"
              onPress={() => void Linking.openURL(google.privacyUrl)}
            />
            .
          </Text>
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
