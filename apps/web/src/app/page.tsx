import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, Building2, PartyPopper, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostmarkStamp } from "@/components/ui/postmark-stamp";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Journiful - Group Trip Planner | Plan Travel Together",
  description:
    "The group trip planner that makes collaborative travel planning easy. Coordinate itineraries, accommodations, events, and member logistics all in one place.",
  alternates: { canonical: "/" },
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://journiful.app";

const features = [
  {
    icon: Calendar,
    title: "Shared Itineraries",
    description:
      "Build a day-by-day schedule your whole group can see and contribute to.",
  },
  {
    icon: Building2,
    title: "Accommodations",
    description:
      "Research and decide on lodging together with all the details in one place.",
  },
  {
    icon: PartyPopper,
    title: "Event Planning",
    description:
      "Create events with RSVP tracking so everyone knows what's happening and when.",
  },
  {
    icon: Plane,
    title: "Travel Logistics",
    description:
      "Track member availability, flights, and travel details to keep the group in sync.",
  },
] as const;

const steps = [
  {
    number: "1",
    title: "Create a trip",
    description: "Set dates, add a destination, and give your trip a name.",
  },
  {
    number: "2",
    title: "Invite your group",
    description: "Share a link and everyone joins in seconds.",
  },
  {
    number: "3",
    title: "Plan together",
    description: "Add events, accommodations, and logistics as a group.",
  },
] as const;

export default async function Home() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth_token");

  if (authToken?.value) {
    redirect("/trips");
  }

  return (
    <>
      <main className="flex min-h-screen flex-col bg-background linen-texture">
        {/* Hero Section */}
        <section className="relative flex flex-col items-center justify-center px-4 pt-24 pb-20 text-center sm:pt-32 sm:pb-28">
          {/* Postmark decoration */}
          <div className="absolute top-8 right-8 sm:top-12 sm:right-16 hidden sm:block">
            <PostmarkStamp date="EST. 2026" city="JOURNIFUL" size="lg" />
          </div>
          <h1 className="mb-4 max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl font-display">
            Plan Group Trips Together
          </h1>
          <p className="mb-3 max-w-lg text-center text-lg text-muted-foreground sm:text-xl">
            The trip planning app that brings your travel group together.
            Coordinate everything in one place.
          </p>
          <p className="mb-10 text-xl text-accent font-script">
            Wish you were here...
          </p>
          <Button
            variant="gradient"
            size="lg"
            className="px-10 font-accent"
            asChild
          >
            <Link href="/login">Get started</Link>
          </Button>
        </section>

        {/* Features Section */}
        <section className="px-4 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-playfair">
              Everything your group needs to plan the perfect trip
            </h2>
            <div className="grid gap-8 sm:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-md border border-border bg-card p-6 linen-texture"
                >
                  <feature.icon className="mb-3 h-6 w-6 text-accent" />
                  <h3 className="mb-2 text-lg font-semibold text-foreground font-accent">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="px-4 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-playfair">
              How Journiful works
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="text-center">
                  <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-sm border-2 border-dashed border-accent text-sm font-bold text-accent font-accent">
                    {step.number}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground font-accent">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA Section */}
        <section className="flex flex-col items-center px-4 pt-12 pb-24 text-center sm:pb-32">
          <p className="mb-2 text-lg text-accent font-script">
            Wish you were here?
          </p>
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-playfair">
            Ready to plan your next adventure?
          </h2>
          <Button
            variant="gradient"
            size="lg"
            className="px-10 font-accent"
            asChild
          >
            <Link href="/login">Start planning</Link>
          </Button>
        </section>
      </main>

      {/* Structured Data */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Journiful",
          url: siteUrl,
          description:
            "Plan group trips together. Coordinate itineraries, accommodations, and events with your travel companions in one place.",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Journiful",
          url: siteUrl,
          applicationCategory: "TravelApplication",
          operatingSystem: "Web",
          description:
            "The group trip planner that makes collaborative travel planning easy.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }}
      />
    </>
  );
}
