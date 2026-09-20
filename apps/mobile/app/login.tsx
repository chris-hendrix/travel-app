import { useState } from "react";
import { Link, Redirect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/Button";
import { Checkbox, CheckboxLabel } from "@/components/ui/Checkbox";
import { PhoneField } from "@/components/ui/PhoneField";
import { QuietAction } from "@/components/ui/QuietAction";
import { Screen } from "@/components/ui/Screen";
import { phoneError, toE164 } from "@/lib/phone";
import { useLeaveFlow } from "@/hooks/useLeaveFlow";
import { useAuth } from "@/lib/authStore";

/**
 * The way in: a phone number, and the consent that permits the text.
 *
 * One screen for signing in and for signing up, because they are the
 * same act here. The API decides afterwards whether the number is a
 * person it knows, which is what `requiresProfile` carries.
 *
 * Consent is a control, not a statement. For a website opt-in the
 * carriers want the reader to actively choose the messages, and Twilio
 * rejects campaigns whose form has no separate consent control (30925)
 * or whose consent is a condition of having an account (30923). An
 * implied "by continuing" consent fails the first reading of that, and
 * the TCPA's lighter standard for transactional messages does not save
 * it: the campaign review is stricter than the law's floor.
 *
 * So the box stays, the disclosure it carries keeps all four elements
 * the reviewers look for, and the two documents sit under it rather than
 * inside it, since a link inside a pressable row fires both.
 *
 * That makes any wording change here a change to the registered
 * campaign, and to the version stamped on the consent record.
 */
export default function Login() {
  const router = useRouter();
  const { user, requestCode } = useAuth();
  const leave = useLeaveFlow();

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
      router.push("/verify");
    } catch (caught) {
      setFailure(
        caught instanceof Error ? caught.message : "Could not send the code.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Signed in already, which is what pressing back from the trips list
  // arrives as: a sign-in form is not a thing to show somebody who is in.
  if (user) return <Redirect href="/trips" />;

  return (
    <Screen>
      <View className="gap-6 pt-4 md:pt-14">
        <View className="gap-3">
          <Text className="font-display text-4xl uppercase leading-none text-ink">
            Get started
          </Text>
          <Text className="font-body text-base leading-snug text-ink">
            Enter your phone number to sign in or create an account. We send a
            code by text, so there is no password to remember.
          </Text>
        </View>

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
            In the US, ten digits is enough. Anywhere else, start with + and
            the country code.
          </Text>
        ) : null}

        {failure ? (
          <Text className="font-body text-sm text-ink">{failure}</Text>
        ) : null}

        <View className="gap-3">
          <Checkbox checked={consent} onToggle={() => setConsent(!consent)}>
            <CheckboxLabel>
              I agree to receive text messages from Journiful: a one-time code
              now, and trip updates, event reminders and invites after that.
              Message frequency varies. Message and data rates may apply.
              Reply STOP to opt out. Consent is not required to use Journiful.
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
            title={busy ? "Sending" : "Continue"}
            disabled={!e164 || !consent || busy}
            onPress={send}
          />
          <QuietAction label="Back" onPress={leave} align="center" />
        </ActionRow>
      </View>
    </Screen>
  );
}
