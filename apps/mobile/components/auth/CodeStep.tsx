import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
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
 *
 * The screen decides what happens next, because the answer is not the
 * same on both sides: the sign-in screen replaces itself with the trips
 * list or the profile step, and an invitation keeps the reader where
 * they are and moves to its own next step.
 */
export function CodeStep({
  title,
  body,
  onVerified,
  onChangeNumber,
}: {
  title?: string;
  body?: ReactNode;
  /** `requiresProfile` is the API's own answer: nobody has this number. */
  onVerified: (requiresProfile: boolean) => void;
  /** "Use a different number", which is the number step again. */
  onChangeNumber: () => void;
}) {
  const { pendingPhone, requestCode, verifyCode } = useAuth();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

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
        onVerified(requiresProfile);
      } catch (caught) {
        setFailure(
          caught instanceof Error ? caught.message : "Verification failed.",
        );
        setCode("");
      } finally {
        setBusy(false);
      }
    },
    [onVerified, verifyCode],
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

  const line =
    body ??
    (pendingPhone
      ? `Enter the 6-digit code sent to ${formatPhoneForDisplay(pendingPhone)}.`
      : "Enter the 6-digit code we sent you.");

  return (
    <View className="gap-6">
      {title ? (
        <View className="gap-3">
          <Text className="font-display text-4xl uppercase leading-none text-ink">
            {title}
          </Text>
          <Text className="font-body text-base leading-snug text-ink">
            {line}
          </Text>
        </View>
      ) : (
        <Text className="font-body text-base leading-snug text-ink">{line}</Text>
      )}

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
          <QuietAction label="Use a different number" onPress={onChangeNumber} />
          <QuietAction
            label={cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            onPress={() => void resend()}
          />
        </View>
      </ActionRow>
    </View>
  );
}
