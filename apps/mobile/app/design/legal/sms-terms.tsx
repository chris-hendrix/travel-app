import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

export default function SmsTerms() {
  return <LegalScreen document={legalDocument("sms-terms")} />;
}
