import { Linking } from "react-native";
import { useRouter } from "expo-router";
import type { LegalDocument } from "@journiful/shared/legal";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Prose } from "@/components/ui/Prose";
import { legalTarget } from "@/lib/legal";

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

  return (
    <FullscreenDialog title={document.title} dismissHref="/profile">
      <Prose
        document={document}
        onLink={(href) => {
          const target = legalTarget(href);
          if (target.startsWith("/")) router.push(target);
          else void Linking.openURL(target);
        }}
      />
    </FullscreenDialog>
  );
}
