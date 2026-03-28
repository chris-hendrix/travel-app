import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Journiful Privacy Policy. Learn how we collect, use, and protect your personal information including phone number, trip data, and SMS communications.",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground">
        Last updated: March 28, 2026
        <br />
        Effective date: March 28, 2026
      </p>
      <p>
        This Privacy Policy describes how Journiful (&quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) collects, uses, and shares
        information when you use our trip planning application and related
        services. This policy is provided for informational purposes and does
        not constitute legal advice.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Information We Collect
      </h2>
      <p>We collect the following types of information:</p>
      <ul className="list-disc pl-6 text-foreground">
        <li>
          <strong>Phone number</strong> &mdash; used for account registration,
          authentication, and SMS communications
        </li>
        <li>
          <strong>Display name</strong> &mdash; the name you choose to identify
          yourself within trips
        </li>
        <li>
          <strong>Trip data</strong> &mdash; itineraries, events,
          accommodations, messages, and other content you create or contribute to
        </li>
        <li>
          <strong>Usage data</strong> &mdash; how you interact with the
          application, including pages visited, features used, and actions taken
        </li>
        <li>
          <strong>Device information</strong> &mdash; browser type, operating
          system, and device identifiers used for security and troubleshooting
        </li>
      </ul>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        How We Use Your Information
      </h2>
      <ul className="list-disc pl-6 text-foreground">
        <li>
          <strong>App functionality</strong> &mdash; to provide, maintain, and
          improve the Journiful trip planning experience
        </li>
        <li>
          <strong>SMS communications</strong> &mdash; to send trip updates, event
          reminders, invite notifications, and verification codes
        </li>
        <li>
          <strong>Analytics</strong> &mdash; to understand usage patterns and
          improve our service
        </li>
        <li>
          <strong>Security</strong> &mdash; to detect and prevent fraud, abuse,
          and unauthorized access
        </li>
      </ul>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        SMS Data Collection and Use
      </h2>
      <p>
        When you opt in to Journiful Trip Notifications, we collect your phone
        number and a record of your consent (including the date, time, and
        version of the disclosure you agreed to). This data is used solely to
        send you transactional SMS messages related to your Journiful account
        and trip activity.
      </p>
      <p>
        <strong>
          Your phone number and opt-in data will not be shared with or sold to
          third parties for marketing purposes.
        </strong>{" "}
        SMS data is shared only with our messaging service provider (Twilio) for
        the purpose of delivering messages to you.
      </p>
      <p>
        For full details on our SMS program, see our{" "}
        <Link href="/sms-terms" className="text-primary underline">
          SMS Terms &amp; Conditions
        </Link>
        .
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Data Sharing
      </h2>
      <p>
        We do <strong>not</strong> sell your personal data. We may share limited
        information with:
      </p>
      <ul className="list-disc pl-6 text-foreground">
        <li>
          <strong>Service providers</strong> &mdash; trusted third parties such
          as Twilio (SMS delivery), cloud hosting providers, and analytics
          services that help us operate Journiful
        </li>
        <li>
          <strong>Legal requirements</strong> &mdash; when required by law,
          regulation, or legal process
        </li>
        <li>
          <strong>Safety</strong> &mdash; to protect the rights, safety, or
          property of Journiful, our users, or the public
        </li>
      </ul>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Data Retention and Deletion
      </h2>
      <p>
        We retain your personal information for as long as your account is
        active or as needed to provide you with our services. You may request
        deletion of your account and associated data at any time by contacting{" "}
        <a
          href="mailto:support@journiful.com"
          className="text-primary underline"
        >
          support@journiful.com
        </a>
        . Upon receiving a deletion request, we will remove your data within 30
        days, except where retention is required by law.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Your Rights
      </h2>
      <p>You have the right to:</p>
      <ul className="list-disc pl-6 text-foreground">
        <li>
          <strong>Access</strong> the personal information we hold about you
        </li>
        <li>
          <strong>Correct</strong> inaccurate or incomplete information
        </li>
        <li>
          <strong>Delete</strong> your account and personal data
        </li>
      </ul>
      <p>
        To exercise any of these rights, contact{" "}
        <a
          href="mailto:support@journiful.com"
          className="text-primary underline"
        >
          support@journiful.com
        </a>
        .
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Children&apos;s Privacy
      </h2>
      <p>
        Journiful is not directed to children under the age of 13. We do not
        knowingly collect personal information from children under 13. If we
        become aware that we have collected data from a child under 13, we will
        take steps to delete it promptly.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Changes to This Policy
      </h2>
      <p>
        We may update this Privacy Policy from time to time. When we make
        material changes, we will notify you through the Journiful application
        or via SMS. Your continued use of Journiful after changes take effect
        constitutes acceptance of the updated policy.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Contact Us
      </h2>
      <p>
        If you have questions about this Privacy Policy, contact us at{" "}
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
