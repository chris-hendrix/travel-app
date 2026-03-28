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
      <header className="mb-12">
        <h1 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: March 28, 2026 &middot; Effective: March 28, 2026
        </p>
      </header>

      <div className="space-y-10 text-[15px] leading-relaxed text-foreground/90">
        <p>
          This Privacy Policy describes how Journiful (&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares
          information when you use our trip planning application and related
          services. This document is provided for informational purposes and does
          not constitute legal advice.
        </p>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Information We Collect
          </h2>
          <p className="mb-3">We collect the following types of information:</p>
          <dl className="space-y-3">
            <div>
              <dt className="font-medium text-foreground">Phone number</dt>
              <dd className="text-foreground/80">
                Used for account registration, authentication, and SMS
                communications.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Display name</dt>
              <dd className="text-foreground/80">
                The name you choose to identify yourself within trips.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Trip data</dt>
              <dd className="text-foreground/80">
                Itineraries, events, accommodations, messages, and other content
                you create or contribute to.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Usage data</dt>
              <dd className="text-foreground/80">
                How you interact with the application, including pages visited
                and features used.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Device information
              </dt>
              <dd className="text-foreground/80">
                Browser type, operating system, and device identifiers used for
                security and troubleshooting.
              </dd>
            </div>
          </dl>
        </section>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            How We Use Your Information
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="font-medium text-foreground">App functionality</dt>
              <dd className="text-foreground/80">
                To provide, maintain, and improve the Journiful trip planning
                experience.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                SMS communications
              </dt>
              <dd className="text-foreground/80">
                To send trip updates, event reminders, invite notifications, and
                verification codes.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Analytics</dt>
              <dd className="text-foreground/80">
                To understand usage patterns and improve our service.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Security</dt>
              <dd className="text-foreground/80">
                To detect and prevent fraud, abuse, and unauthorized access.
              </dd>
            </div>
          </dl>
        </section>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            SMS Data Collection and Use
          </h2>
          <p className="mb-3">
            When you opt in to Journiful Trip Notifications, we collect your
            phone number and a record of your consent (including the date, time,
            and version of the disclosure you agreed to). This data is used
            solely to send you transactional SMS messages related to your
            Journiful account and trip activity.
          </p>
          <p className="mb-3 rounded-md border border-border bg-card p-4 text-sm font-medium text-foreground">
            Your phone number and opt-in data will not be shared with or sold to
            third parties for marketing purposes.
          </p>
          <p className="text-foreground/80">
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

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Data Sharing
          </h2>
          <p className="mb-3">
            We do <strong className="text-foreground">not</strong> sell your
            personal data. We may share limited information with:
          </p>
          <dl className="space-y-3">
            <div>
              <dt className="font-medium text-foreground">
                Service providers
              </dt>
              <dd className="text-foreground/80">
                Trusted third parties such as Twilio (SMS delivery), cloud
                hosting providers, and analytics services that help us operate
                Journiful.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Legal requirements
              </dt>
              <dd className="text-foreground/80">
                When required by law, regulation, or legal process.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Safety</dt>
              <dd className="text-foreground/80">
                To protect the rights, safety, or property of Journiful, our
                users, or the public.
              </dd>
            </div>
          </dl>
        </section>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
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
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
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

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
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
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. When we make
            material changes, we will notify you through the Journiful
            application or via SMS. Your continued use of Journiful after changes
            take effect constitutes acceptance of the updated policy.
          </p>
        </section>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
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
