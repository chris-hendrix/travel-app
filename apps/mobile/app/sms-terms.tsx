import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

// Alias for the published URL: the outside world (Twilio registration,
// shared copy) points at /sms-terms, so this renders the same screen as
// app/legal/sms-terms.tsx rather than copying it.
export default function SmsTermsAlias() {
  return <LegalScreen document={legalDocument("sms-terms")} />;
}
