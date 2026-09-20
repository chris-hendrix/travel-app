import { useState, type ReactNode } from "react";
import { Link } from "expo-router";
import { Text, View } from "react-native";
import { ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/Button";
import { Checkbox, CheckboxLabel } from "@/components/ui/Checkbox";
import { PhoneField } from "@/components/ui/PhoneField";
import { QuietAction } from "@/components/ui/QuietAction";
import { phoneError, toE164 } from "@/lib/phone";
import { useAuth } from "@/lib/authStore";

/**
 * The number, and the consent that permits the text. One body, two ways
 * in: the sign-in screen, and the invitation a friend's link opens.
 *
 * Consent is a control, not a statement. For a website opt-in the
 * carriers want the reader to actively choose the messages, and Twilio
 * rejects campaigns whose form has no separate consent control (30925)
 * or whose consent is a condition of having an account (30923). An
 * implied "by continuing" consent fails the first reading of that, and
 * the TCPA's lighter standard for transactional messages does not save
 * it: the campaign review is stricter than the law's floor.
 *
 * Which is why this block lives here rather than in each screen: the
 * invitation collects a number too, and a second copy of the disclosure
 * is a second thing to keep in step with the registered campaign and
 * with the version stamped on the consent record.
 *
 * No heading of its own. The sign-in screen supplies one because it is
 * the page's subject; an invitation supplies a card instead, and a
 * title above that would say the same thing twice.
 */
export function PhoneStep({
  title,
  body,
  submitLabel = "Continue",
  leaveLabel = "Back",
  onSent,
  onLeave,
}: {
  title?: string;
  body?: ReactNode;
  submitLabel?: string;
  leaveLabel?: string;
  /** Called with the E.164 number once the code has been asked for. */
  onSent: (phone: string) => void;
  /** The labelled exit under the button. */
  onLeave: () => void;
}) {
  const { requestCode } = useAuth();

  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const e164 = toE164(phone);
  const error = submitted ? phoneError(phone) : undefined;

  async function send() {
    setSubmitted(true);
    if (!e164 || !consent) return;

    setBusy(true);
    setFailure(null);
    try {
      await requestCode(e164);
      onSent(e164);
    } catch (caught) {
      setFailure(
        caught instanceof Error ? caught.message : "Could not send the code.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-6">
      {title ? (
        <View className="gap-3">
          <Text className="font-display text-4xl uppercase leading-none text-ink">
            {title}
          </Text>
          {body ? (
            <Text className="font-body text-base leading-snug text-ink">
              {body}
            </Text>
          ) : null}
        </View>
      ) : null}

      <PhoneField
        value={phone}
        onChangeText={(next) => {
          setPhone(next);
          setFailure(null);
        }}
        error={error}
        autoFocus
      />

      {phone && !e164 ? (
        <Text className="font-body text-sm text-ink">
          In the US, ten digits is enough. Anywhere else, start with + and the
          country code.
        </Text>
      ) : null}

      {failure ? (
        <Text className="font-body text-sm text-ink">{failure}</Text>
      ) : null}

      <View className="gap-3">
        <Checkbox checked={consent} onToggle={() => setConsent(!consent)}>
          <CheckboxLabel>
            I agree to receive text messages from Journiful: a one-time code now,
            and trip updates, event reminders and invites after that. Message
            frequency varies. Message and data rates may apply. Reply STOP to opt
            out. Consent is not required to use Journiful.
          </CheckboxLabel>
        </Checkbox>
        <View className="flex-row gap-4 pl-8">
          <Link
            href="/design/legal/sms-terms"
            className="font-body text-sm text-ink underline"
          >
            SMS Terms
          </Link>
          <Link
            href="/design/legal/privacy"
            className="font-body text-sm text-ink underline"
          >
            Privacy Policy
          </Link>
        </View>
      </View>

      <ActionRow>
        <Button
          title={busy ? "Sending" : submitLabel}
          disabled={!e164 || !consent || busy}
          onPress={send}
        />
        <QuietAction label={leaveLabel} onPress={onLeave} align="center" />
      </ActionRow>
    </View>
  );
}
