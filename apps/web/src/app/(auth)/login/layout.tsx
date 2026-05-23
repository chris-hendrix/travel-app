import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to Journiful to start planning your next group trip. Coordinate travel plans with friends and family.",
  alternates: { canonical: "/login" },
};

export default async function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  // In static export mode, cookies are unavailable — skip auth check
  const isExport = process.env.NEXT_EXPORT === "true";

  if (!isExport) {
    const cookieStore = await cookies();
    const authToken = cookieStore.get("auth_token");

    if (authToken?.value) {
      redirect("/trips");
    }
  }

  return children;
}
