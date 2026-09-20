import type { LegalDocument } from "./types";

/**
 * Transcribed from the copy published at journiful.app/sms-terms.
 *
 * This is the wording registered with the carriers for the SMS program,
 * so it is the strictest of the three: the frequency range, the STOP
 * and HELP keywords, and the not-shared-for-marketing sentence are
 * checked against what was filed, not against house style.
 *
 * The document opens without a heading — the paragraph and the list of
 * message types are their own introduction.
 */
export const smsTerms: LegalDocument = {
  id: "sms-terms",
  title: "SMS Terms & Conditions",
  route: "/sms-terms",
  lastUpdated: "March 28, 2026",
  body: `
    Journiful Trip Notifications is an SMS program operated by Journiful.
    By opting in, you consent to receive text messages related to your use
    of Journiful, including:

    - Trip updates and changes
    - Event reminders and RSVP notifications
    - Trip invite notifications
    - Phone number verification codes

    ## Message Frequency

    Message frequency varies based on trip activity. Typically 1–10
    messages per month.

    ## Fees

    Message and data rates may apply. Your carrier's standard messaging
    rates will apply to all messages sent and received.

    ## Opt-Out

    Reply **STOP** to any message to unsubscribe. You will receive a single
    confirmation message. After opting out, you will no longer receive text
    messages from Journiful unless you opt in again.

    ## Help

    Reply **HELP** for help, or contact
    [support@journiful.com](mailto:support@journiful.com).

    ## Carrier Information

    Supported carriers include AT&T, T-Mobile, Verizon, and others.
    Carriers are not liable for delayed or undelivered messages.

    ## Privacy

    Your phone number and opt-in data will not be shared with or sold to
    third parties for marketing purposes. For more information, see our
    [Privacy Policy](/privacy).

    ## Customer Care

    For questions or support, contact us at
    [support@journiful.com](mailto:support@journiful.com).
  `,
};
