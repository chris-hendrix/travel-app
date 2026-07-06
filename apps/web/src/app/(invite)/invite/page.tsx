import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitePageClient } from "./invite-page-client";

export const metadata: Metadata = {
  title: "Trip Invitation",
  description: "You've been invited to join a trip on Journiful!",
};

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InvitePageClient />
    </Suspense>
  );
}
