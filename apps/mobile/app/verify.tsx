import { useCallback, useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useAuth } from "@/lib/authStore";

/** Seconds before the code may be asked for again. The API has its own
 *  limit; this is so a thumb cannot find it. */
const RESEND_COOLDOWN = 30;

/**
 * The six digits, and the platform's own way of filling them in.
 *
 * `autoComplete="sms-otp"` on Android and `textContentType="oneTimeCode"`
 * on iOS mean the code arrives with one tap off the message, which is
 * the single best thing an app has over the web here. The field is one
 * box rather than six, because the system's autofill targets one, and
 * because six boxes need six refs and a keyboard dance to behave.
 *
 * Six digits submit on their own. The button stays for the case where
 * autofill did not fire and the reader wants to be sure.
 */
export default function Verify() {
  const router = useRouter();
  const { pendingPhone, requestCode, verifyCode, user } = useAuth();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // A code screen with no number behind it is a dead end: a reload, or a
  // deep link, arrives here with nothing to verify. And a reader who is
  // already through belongs past this screen, not on it.
  useEffect(() => {
    if (!user && !pendingPhone) router.replace("/login");
  }, [pendingPhone, router, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setFailure(null);
      try {
        const { requiresProfile } = await verifyCode(value);
        router.replace(requiresProfile ? "/complete-profile" : "/trips");
      } catch (caught) {
        setFailure(
          caught instanceof Error ? caught.message : "Verification failed.",
        );
        setCode("");
      } finally {
        setBusy(false);
      }
    },
    [router, verifyCode],
  );

  function change(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    setFailure(null);
    setNote(null);
    if (digits.length === 6) void submit(digits);
  }

  async function resend() {
    if (!pendingPhone || cooldown > 0) return;
    setFailure(null);
    setNote(null);
    try {
      await requestCode(pendingPhone);
      setCode("");
      setCooldown(RESEND_COOLDOWN);
      setNote("A new code is on its way.");
    } catch (caught) {
      setFailure(
        caught instanceof Error ? caught.message : "Could not send the code.",
      );
    }
  }

  if (user?.profileComplete) return <Redirect href="/trips" />;
  if (user) return <Redirect href="/complete-profile" />;
  if (!pendingPhone) return <Redirect href="/login" />;

  return (
    <Screen lead>
      <View className="gap-3">
        <Text className="font-display text-4xl uppercase leading-none text-ink">
          Verify your number
        </Text>
        <Text className="font-body text-base leading-snug text-ink">
          {pendingPhone
            ? `Enter the 6-digit code sent to ${formatPhoneForDisplay(pendingPhone)}.`
            : "Enter the 6-digit code we sent you."}
        </Text>
      </View>

      <TextField
        label="Code"
        value={code}
        onChangeText={change}
        placeholder="000000"
        error={failure ?? undefined}
        centered
        maxLength={6}
        autoFocus
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
      />

      {note ? (
        <Text className="font-body text-sm text-ink">{note}</Text>
      ) : null}

      <ActionRow>
        <Button
          title={busy ? "Checking" : "Verify"}
          disabled={code.length !== 6 || busy}
          onPress={() => void submit(code)}
        />
        <View className="flex-row gap-6 md:self-center">
          <QuietAction
            label="Use a different number"
            onPress={() => router.replace("/login")}
          />
          <QuietAction
            label={cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            onPress={() => void resend()}
          />
        </View>
      </ActionRow>
    </Screen>
  );
}
