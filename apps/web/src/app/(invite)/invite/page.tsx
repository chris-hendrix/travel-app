import { Suspense } from "react";
import { InvitePageClient } from "./invite-page-client";

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InvitePageClient />
    </Suspense>
  );
}
