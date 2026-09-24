import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

// Alias for the published URL: the outside world (Twilio registration,
// shared copy) points at /terms, so this renders the same screen as
// app/legal/terms.tsx rather than copying it.
export default function TermsAlias() {
  return <LegalScreen document={legalDocument("terms")} />;
}
