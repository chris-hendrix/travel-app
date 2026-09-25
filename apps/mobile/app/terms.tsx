import { legalDocument } from "@journiful/shared/legal";
import { LegalScreen } from "@/components/legal/LegalScreen";

// The published path: the outside world (Twilio registration, shared
// copy) points at /terms, so the screen lives at the address it is
// published at rather than behind an alias.
export default function Terms() {
  return <LegalScreen document={legalDocument("terms")} />;
}
