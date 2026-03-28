import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SMS Terms & Conditions | Journiful",
  description:
    "SMS Terms and Conditions for Journiful Trip Notifications. Message frequency, opt-out instructions, and carrier information.",
};

export default function SmsTermsPage() {
  return (
    <article>
      <header className="mb-12">
        <h1 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          SMS Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: March 28, 2026
        </p>
      </header>

      <div className="space-y-10 text-[15px] leading-relaxed text-foreground/90">
        <section>
          <p>
            Journiful Trip Notifications is an SMS program operated by Journiful.
            By opting in, you consent to receive text messages related to your
            use of Journiful, including:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground/80">
            <li>Trip updates and changes</li>
            <li>Event reminders and RSVP notifications</li>
            <li>Trip invite notifications</li>
            <li>Phone number verification codes</li>
          </ul>
        </section>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Message Frequency
          </h2>
          <p>
            Message frequency varies based on trip activity. Typically 1&ndash;10
            messages per month.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Fees
          </h2>
          <p>
            Message and data rates may apply. Your carrier&apos;s standard
            messaging rates will apply to all messages sent and received.
          </p>
        </section>

        <div className="border-t border-border" />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Opt-Out
          </h2>
          <p>
            Reply <strong className="text-foreground">STOP</strong> to any
            message to unsubscribe. You will receive a single confirmation
            message. After opting out, you will no longer receive text messages
            from Journiful unless you opt in again.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Help
          </h2>
          <p>
            Reply <strong className="text-foreground">HELP</strong> for help, or
            contact{" "}
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Carrier Information
          </h2>
          <p>
            Supported carriers include AT&amp;T, T-Mobile, Verizon, and others.
            Carriers are not liable for delayed or undelivered messages.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Privacy
          </h2>
          <p>
            Your phone number and opt-in data will not be shared with or sold to
            third parties for marketing purposes. For more information, see
            our{" "}
            <Link
              href="/privacy"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Customer Care
          </h2>
          <p>
            For questions or support, contact us at{" "}
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
