import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Journiful Terms of Service. Read our terms governing the use of the Journiful group trip planning application.",
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Terms of Service
      </h1>
      <p className="text-sm text-muted-foreground">
        Last updated: March 28, 2026
        <br />
        Effective date: March 28, 2026
      </p>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of the
        Journiful application and related services (&quot;Service&quot;)
        operated by Journiful (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;). This document is provided for informational purposes
        and does not constitute legal advice.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Acceptance of Terms
      </h2>
      <p>
        By accessing or using Journiful, you agree to be bound by these Terms.
        If you do not agree, you may not use the Service.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Account Registration
      </h2>
      <p>
        Journiful uses phone-based authentication. To create an account, you
        must provide a valid phone number. Each phone number may be associated
        with only one account. You are responsible for maintaining the security
        of your account and for all activity that occurs under it.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        User Responsibilities
      </h2>
      <p>When using Journiful, you agree to:</p>
      <ul className="list-disc pl-6 text-foreground">
        <li>Provide accurate and truthful information</li>
        <li>
          Not use the Service for any unlawful, abusive, or harmful purpose
        </li>
        <li>
          Not interfere with or disrupt the Service or its infrastructure
        </li>
        <li>
          Not attempt to gain unauthorized access to other users&apos; accounts
          or data
        </li>
        <li>Respect the privacy and rights of other users</li>
      </ul>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Trip Content and User-Generated Content
      </h2>
      <p>
        You retain ownership of all content you create or contribute to
        Journiful, including trip itineraries, events, messages, and photos. By
        posting content, you grant Journiful a non-exclusive, worldwide,
        royalty-free license to use, display, and distribute that content solely
        for the purpose of operating and providing the Service to you and your
        trip members.
      </p>
      <p>
        You are responsible for the content you post and must not share content
        that is illegal, defamatory, or infringes on the rights of others.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        SMS Communications
      </h2>
      <p>
        By opting in to SMS notifications, you consent to receive text messages
        from Journiful related to your account and trip activity. Message and
        data rates may apply. You may opt out at any time by replying STOP. For
        complete details, see our{" "}
        <Link href="/sms-terms" className="text-primary underline">
          SMS Terms &amp; Conditions
        </Link>
        .
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Intellectual Property
      </h2>
      <p>
        The Journiful name, logo, design, and all related software, features,
        and documentation are the property of Journiful and are protected by
        intellectual property laws. You may not copy, modify, distribute, or
        create derivative works based on the Service without our prior written
        consent.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Limitation of Liability
      </h2>
      <p>
        To the maximum extent permitted by law, Journiful shall not be liable
        for any indirect, incidental, special, consequential, or punitive
        damages arising out of or related to your use of the Service. Our total
        liability shall not exceed the amount you paid us, if any, in the twelve
        months preceding the claim.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Termination
      </h2>
      <p>
        We may suspend or terminate your account at any time if we reasonably
        believe you have violated these Terms or if continued access poses a
        risk to the Service or other users. You may delete your account at any
        time by contacting{" "}
        <a
          href="mailto:support@journiful.com"
          className="text-primary underline"
        >
          support@journiful.com
        </a>
        .
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Governing Law
      </h2>
      <p>
        These Terms shall be governed by and construed in accordance with the
        laws of the State of Delaware, without regard to its conflict of law
        provisions. Any disputes arising under these Terms shall be resolved in
        the courts located in Delaware.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Contact Us
      </h2>
      <p>
        If you have questions about these Terms, contact us at{" "}
        <a
          href="mailto:support@journiful.com"
          className="text-primary underline"
        >
          support@journiful.com
        </a>
        .
      </p>
    </article>
  );
}
