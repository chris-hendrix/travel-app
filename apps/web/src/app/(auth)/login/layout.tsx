import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

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
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth_token");

  if (authToken?.value) {
    redirect("/trips");
  }

  return children;
}
