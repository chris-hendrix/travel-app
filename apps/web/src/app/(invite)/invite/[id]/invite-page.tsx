import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { API_URL } from "@/lib/api";
import { InvitePreviewCard } from "./invite-preview-card";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [];
}

type PreviewResponse =
  | {
      success: true;
      tripName: string;
      destination: string;
      startDate: string | null;
      endDate: string | null;
      inviterName: string;
      inviteePhone: string;
      tripId: string;
    }
  | { success: true; status: "accepted"; tripId: string }
  | { success: false };

async function fetchPreview(id: string): Promise<PreviewResponse> {
  try {
    const res = await fetch(`${API_URL}/invitations/${id}/preview`, {
      cache: "no-store",
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}

async function acceptInvitation(
  id: string,
  authToken: string,
): Promise<{ success: boolean; tripId?: string }> {
  try {
    const res = await fetch(`${API_URL}/invitations/${id}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}

export const metadata: Metadata = {
  title: "Trip Invitation",
  description: "You've been invited to join a trip on Journiful!",
};

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = (await searchParams) || {};

  if (!id) {
    return <InvitePreviewCard valid={false} />;
  }

  const preview = await fetchPreview(id);

  if (!preview.success) {
    return <InvitePreviewCard valid={false} />;
  }

  // Already accepted — redirect to trip
  if ("status" in preview && preview.status === "accepted") {
    redirect(`/trips?id=${preview.tripId}`);
  }

  // Authenticated user with pending invitation — accept and redirect
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get("auth_token");

    if (authToken?.value && !("status" in preview)) {
      const result = await acceptInvitation(id, authToken.value);
      if (result.success && result.tripId) {
        redirect(`/trips?id=${result.tripId}`);
      }
    }
  } catch {
    // Static export: cookies() throws; fall through to show preview
  }

  // Unauthenticated — show preview card
  if (!("status" in preview)) {
    return (
      <InvitePreviewCard
        valid={true}
        tripName={preview.tripName}
        destination={preview.destination}
        startDate={preview.startDate}
        endDate={preview.endDate}
        inviterName={preview.inviterName}
        inviteePhone={preview.inviteePhone}
        tripId={preview.tripId}
      />
    );
  }

  return <InvitePreviewCard valid={false} />;
}
