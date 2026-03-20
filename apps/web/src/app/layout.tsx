import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers/providers";
import {
  bungeeShade,
  italiana,
  playfairDisplay,
  plusJakartaSans,
  spaceGrotesk,
  specialElite,
} from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { SkipLink } from "@/components/skip-link";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://journiful.app",
  ),
  title: { default: "Journiful - Group Trip Planner", template: "%s | Journiful" },
  description:
    "Plan group trips together. Coordinate itineraries, accommodations, and events with your travel companions in one place.",
  keywords: [
    "group trip planner",
    "trip planning app",
    "collaborative travel planning",
    "plan trip with friends",
    "group vacation planner",
  ],
  authors: [{ name: "Journiful" }],
  creator: "Journiful",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Journiful",
    title: "Journiful - Group Trip Planner",
    description:
      "Plan group trips together. Coordinate itineraries, accommodations, and events with your travel companions in one place.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Journiful - Group Trip Planner",
    description:
      "Plan group trips together. Coordinate itineraries, accommodations, and events with your travel companions in one place.",
  },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Journiful",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1a1814",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        bungeeShade.variable,
        italiana.variable,
        specialElite.variable,
        playfairDisplay.variable,
        plusJakartaSans.variable,
        spaceGrotesk.variable,
      )}
    >
      <body className="antialiased">
        <noscript>
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Journiful requires JavaScript to run. Please enable JavaScript in your
            browser settings.
          </div>
        </noscript>
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
