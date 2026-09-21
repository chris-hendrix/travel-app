import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

export default function Terms() {
  return <LegalScreen document={legalDocument("terms")} />;
}
