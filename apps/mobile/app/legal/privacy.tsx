import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

export default function Privacy() {
  return <LegalScreen document={legalDocument("privacy")} />;
}
