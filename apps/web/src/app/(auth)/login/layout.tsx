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
  if (process.env.NEXT_EXPORT !== "true") {
    let authToken: string | undefined;
    try {
      const cookieStore = await cookies();
      authToken = cookieStore.get("auth_token")?.value;
    } catch {
      // cookies() unavailable during export
    }
    if (authToken) {
      redirect("/trips");
    }
  }

  return children;
}
