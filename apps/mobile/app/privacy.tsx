import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

// Alias for the published URL: the outside world (Twilio registration,
// shared copy) points at /privacy, so this renders the same screen as
// app/legal/privacy.tsx rather than copying it.
export default function PrivacyAlias() {
  return <LegalScreen document={legalDocument("privacy")} />;
}
