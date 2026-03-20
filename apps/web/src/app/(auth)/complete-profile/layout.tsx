import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Complete Profile",
  description: "Complete your Journiful profile to start planning trips.",
  robots: { index: false, follow: false },
};

export default function CompleteProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
