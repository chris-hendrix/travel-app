"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InvitePreviewCard } from "./[id]/invite-preview-card";
import { apiRequest } from "@/lib/api";

type PreviewResponse =
  | { success: true; tripName: string; destination: string; startDate: string | null; endDate: string | null; inviterName: string; inviteePhone: string; tripId: string; }
  | { success: true; status: "accepted"; tripId: string }
  | { success: false };

export function InvitePageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    fetch(`${API_URL}/invitations/${id}/preview`, { cache: "no-store" })
      .then(res => res.json())
      .then(async (data) => {
        // Pending invitation with trip data — try auto-accept for authenticated users
        if (data?.success && data?.tripName && !data?.status) {
          try {
            const acceptResult = await apiRequest<{ success: boolean; tripId: string }>(
              `/invitations/${id}/accept`,
              { method: "POST" },
            );
            if (acceptResult?.success && acceptResult?.tripId) {
              // Auto-accepted — redirect to trip
              if (typeof window !== "undefined") {
                window.location.href = `/trips?id=${acceptResult.tripId}`;
              }
              return;
            }
          } catch {
            // Auto-accept failed (not authenticated, wrong phone, etc.)
            // Fall through to show the preview card
          }
        }
        setPreview(data);
        setLoading(false);
      })
      .catch(() => {
        setPreview({ success: false });
        setLoading(false);
      });
  }, [id]);

  if (!id) {
    return <InvitePreviewCard valid={false} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading invitation...</div>
      </div>
    );
  }

  if (!preview || !preview.success) {
    return <InvitePreviewCard valid={false} />;
  }

  if ("status" in preview && preview.status === "accepted") {
    // Redirect to trip
    if (typeof window !== "undefined") {
      window.location.href = `/trips?id=${preview.tripId}`;
    }
    return null;
  }

  // Show preview card (unauthenticated or pending)
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
