import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SMS Terms & Conditions",
  description:
    "SMS Terms and Conditions for Journiful Trip Notifications. Learn about message frequency, opt-out instructions, and carrier information.",
};

export default function SmsTermsPage() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        SMS Terms &amp; Conditions
      </h1>
      <p className="text-sm text-muted-foreground">
        Last updated: March 28, 2026
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Program Name
      </h2>
      <p>Journiful Trip Notifications</p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Program Description
      </h2>
      <p>
        By opting in to Journiful Trip Notifications, you consent to receive
        text messages related to your use of Journiful, including:
      </p>
      <ul className="list-disc pl-6 text-foreground">
        <li>Trip updates and changes</li>
        <li>Event reminders and RSVP notifications</li>
        <li>Trip invite notifications</li>
        <li>Phone number verification codes</li>
      </ul>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Message Frequency
      </h2>
      <p>
        Message frequency varies based on trip activity. Typically 1&ndash;10
        messages per month.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Fees
      </h2>
      <p>
        Message and data rates may apply. Your carrier&apos;s standard messaging
        rates will apply to all messages sent and received.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Opt-Out
      </h2>
      <p>
        Reply <strong>STOP</strong> to any message to unsubscribe. You will
        receive a single confirmation message. After opting out, you will no
        longer receive text messages from Journiful unless you opt in again.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Help
      </h2>
      <p>
        Reply <strong>HELP</strong> for help, or contact{" "}
        <a
          href="mailto:support@journiful.com"
          className="text-primary underline"
        >
          support@journiful.com
        </a>
        .
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Customer Care
      </h2>
      <p>
        For questions or support, contact us at{" "}
        <a
          href="mailto:support@journiful.com"
          className="text-primary underline"
        >
          support@journiful.com
        </a>
        .
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Carrier Information
      </h2>
      <p>
        Supported carriers include AT&amp;T, T-Mobile, Verizon, and others.
        Carriers are not liable for delayed or undelivered messages.
      </p>

      <h2 className="font-accent text-xl font-semibold text-foreground">
        Privacy
      </h2>
      <p>
        Your phone number and opt-in data will not be shared with or sold to
        third parties for marketing purposes. For more information, see our{" "}
        <Link href="/privacy" className="text-primary underline">
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}
