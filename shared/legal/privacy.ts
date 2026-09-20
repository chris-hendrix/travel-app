import type { LegalDocument } from "./types";

/**
 * Transcribed from the copy published at journiful.app/privacy. Keep it
 * word for word — the SMS program's consent record names the version of
 * the disclosure a person agreed to, and this is that version.
 */
export const privacy: LegalDocument = {
  id: "privacy",
  title: "Privacy Policy",
  route: "/privacy",
  lastUpdated: "March 28, 2026",
  effective: "March 28, 2026",
  body: `
    This Privacy Policy describes how Journiful (“we,” “us,” or “our”)
    collects, uses, and shares information when you use our trip planning
    application and related services. This document is provided for
    informational purposes and does not constitute legal advice.

    ## Information We Collect

    We collect the following types of information:

    - **Phone number** — used for account registration, authentication, and SMS communications
    - **Display name** — the name you choose to identify yourself within trips
    - **Trip data** — itineraries, events, accommodations, messages, and other content you create or contribute to
    - **Usage data** — how you interact with the application, including pages visited and features used
    - **Device information** — browser type, operating system, and device identifiers used for security and troubleshooting

    ## How We Use Your Information

    - **App functionality** — to provide, maintain, and improve the Journiful trip planning experience
    - **SMS communications** — to send trip updates, event reminders, invite notifications, and verification codes
    - **Analytics** — to understand usage patterns and improve our service
    - **Security** — to detect and prevent fraud, abuse, and unauthorized access

    ## SMS Data Collection and Use

    When you opt in to Journiful Trip Notifications, we collect your phone
    number and a record of your consent (including the date, time, and
    version of the disclosure you agreed to). This data is used solely to
    send you transactional SMS messages related to your Journiful account
    and trip activity.

    **Your phone number and opt-in data will not be shared with or sold to
    third parties for marketing purposes.**

    SMS data is shared only with our messaging service provider (Twilio)
    for the purpose of delivering messages to you. For full details on our
    SMS program, see our [SMS Terms & Conditions](/sms-terms).

    ## Data Sharing

    We do **not** sell your personal data. We may share limited information with:

    - **Service providers** — trusted third parties such as Twilio (SMS delivery), cloud hosting providers, and analytics services that help us operate Journiful
    - **Legal requirements** — when required by law, regulation, or legal process
    - **Safety** — to protect the rights, safety, or property of Journiful, our users, or the public

    ## Data Retention and Deletion

    We retain your personal information for as long as your account is
    active or as needed to provide you with our services. You may request
    deletion of your account and associated data at any time by contacting
    [support@journiful.com](mailto:support@journiful.com). Upon receiving a
    deletion request, we will remove your data within 30 days, except where
    retention is required by law.

    ## Your Rights

    You have the right to:

    - **Access** the personal information we hold about you
    - **Correct** inaccurate or incomplete information
    - **Delete** your account and personal data

    To exercise any of these rights, contact
    [support@journiful.com](mailto:support@journiful.com).

    ## Children's Privacy

    Journiful is not directed to children under the age of 13. We do not
    knowingly collect personal information from children under 13. If we
    become aware that we have collected data from a child under 13, we will
    take steps to delete it promptly.

    ## Changes to This Policy

    We may update this Privacy Policy from time to time. When we make
    material changes, we will notify you through the Journiful application
    or via SMS. Your continued use of Journiful after changes take effect
    constitutes acceptance of the updated policy.

    ## Contact Us

    If you have questions about this Privacy Policy, contact us at
    [support@journiful.com](mailto:support@journiful.com).
  `,
};
