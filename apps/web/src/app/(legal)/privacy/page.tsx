import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Journiful",
  description:
    "Journiful Privacy Policy. How we collect, use, and protect your personal information including phone number, trip data, and SMS communications.",
};

export default function PrivacyPolicyPage() {
  return (
    <article>
      <header className="mb-10">
        <h1 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: March 28, 2026 &middot; Effective: March 28, 2026
        </p>
      </header>

      <div className="space-y-8 text-[15px] leading-relaxed text-foreground/90">
        <p>
          This Privacy Policy describes how Journiful (&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares
          information when you use our trip planning application and related
          services. This document is provided for informational purposes and does
          not constitute legal advice.
        </p>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-3">
            Information We Collect
          </h2>
          <p className="mb-3">We collect the following types of information:</p>
          <ul className="list-disc space-y-2 pl-5 text-foreground/80">
            <li>
              <strong className="text-foreground">Phone number</strong> &mdash;
              used for account registration, authentication, and SMS
              communications
            </li>
            <li>
              <strong className="text-foreground">Display name</strong> &mdash;
              the name you choose to identify yourself within trips
            </li>
            <li>
              <strong className="text-foreground">Trip data</strong> &mdash;
              itineraries, events, accommodations, messages, and other content
              you create or contribute to
            </li>
            <li>
              <strong className="text-foreground">Usage data</strong> &mdash;
              how you interact with the application, including pages visited and
              features used
            </li>
            <li>
              <strong className="text-foreground">Device information</strong>{" "}
              &mdash; browser type, operating system, and device identifiers used
              for security and troubleshooting
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-3">
            How We Use Your Information
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-foreground/80">
            <li>
              <strong className="text-foreground">App functionality</strong>{" "}
              &mdash; to provide, maintain, and improve the Journiful trip
              planning experience
            </li>
            <li>
              <strong className="text-foreground">SMS communications</strong>{" "}
              &mdash; to send trip updates, event reminders, invite
              notifications, and verification codes
            </li>
            <li>
              <strong className="text-foreground">Analytics</strong> &mdash; to
              understand usage patterns and improve our service
            </li>
            <li>
              <strong className="text-foreground">Security</strong> &mdash; to
              detect and prevent fraud, abuse, and unauthorized access
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-3">
            SMS Data Collection and Use
          </h2>
          <p className="mb-3">
            When you opt in to Journiful Trip Notifications, we collect your
            phone number and a record of your consent (including the date, time,
            and version of the disclosure you agreed to). This data is used
            solely to send you transactional SMS messages related to your
            Journiful account and trip activity.
          </p>
          <p className="mb-3 font-medium text-foreground">
            Your phone number and opt-in data will not be shared with or sold to
            third parties for marketing purposes.
          </p>
          <p>
            SMS data is shared only with our messaging service provider (Twilio)
            for the purpose of delivering messages to you. For full details on
            our SMS program, see our{" "}
            <Link
              href="/sms-terms"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              SMS Terms &amp; Conditions
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-3">
            Data Sharing
          </h2>
          <p className="mb-3">
            We do <strong className="text-foreground">not</strong> sell your
            personal data. We may share limited information with:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-foreground/80">
            <li>
              <strong className="text-foreground">Service providers</strong>{" "}
              &mdash; trusted third parties such as Twilio (SMS delivery), cloud
              hosting providers, and analytics services that help us operate
              Journiful
            </li>
            <li>
              <strong className="text-foreground">Legal requirements</strong>{" "}
              &mdash; when required by law, regulation, or legal process
            </li>
            <li>
              <strong className="text-foreground">Safety</strong> &mdash; to
              protect the rights, safety, or property of Journiful, our users,
              or the public
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-3">
            Data Retention and Deletion
          </h2>
          <p>
            We retain your personal information for as long as your account is
            active or as needed to provide you with our services. You may request
            deletion of your account and associated data at any time by
            contacting{" "}
            <a
              href="mailto:support@journiful.com"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              support@journiful.com
            </a>
            . Upon receiving a deletion request, we will remove your data within
            30 days, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-3">
            Your Rights
          </h2>
          <p className="mb-3">You have the right to:</p>
          <ul className="list-disc space-y-1 pl-5 text-foreground/80">
            <li>
              <strong className="text-foreground">Access</strong> the personal
              information we hold about you
            </li>
            <li>
              <strong className="text-foreground">Correct</strong> inaccurate or
              incomplete information
            </li>
            <li>
              <strong className="text-foreground">Delete</strong> your account
              and personal data
            </li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact{" "}
            <a
              href="mailto:support@journiful.com"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              support@journiful.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-2">
            Children&apos;s Privacy
          </h2>
          <p>
            Journiful is not directed to children under the age of 13. We do not
            knowingly collect personal information from children under 13. If we
            become aware that we have collected data from a child under 13, we
            will take steps to delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-2">
            Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. When we make
            material changes, we will notify you through the Journiful
            application or via SMS. Your continued use of Journiful after changes
            take effect constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="font-accent text-lg font-semibold text-foreground mb-2">
            Contact Us
          </h2>
          <p>
            If you have questions about this Privacy Policy, contact us at{" "}
            <a
              href="mailto:support@journiful.com"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              support@journiful.com
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
