import { useEffect } from "react";
import { Redirect, useRouter } from "expo-router";
import { View } from "react-native";
import { CodeStep } from "@/components/auth/CodeStep";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/lib/authStore";

/**
 * The code screen. The field, the autofill, the resend and its cooldown
 * are CodeStep's; what is here is the way in and the way out of it.
 *
 * A code screen with no number behind it is a dead end: a reload, or a
 * deep link, arrives here with nothing to verify. And a reader who is
 * already through belongs past this screen, not on it.
 */
export default function Verify() {
  const router = useRouter();
  const { pendingPhone, user } = useAuth();

  useEffect(() => {
    if (!user && !pendingPhone) router.replace("/login");
  }, [pendingPhone, router, user]);

  if (user?.profileComplete) return <Redirect href="/trips" />;
  if (user) return <Redirect href="/complete-profile" />;
  if (!pendingPhone) return <Redirect href="/login" />;

  return (
    <Screen>
      <View className="pt-4 md:pt-14">
        <CodeStep
          title="Verify your number"
          onVerified={(requiresProfile) =>
            router.replace(requiresProfile ? "/complete-profile" : "/trips")
          }
          onChangeNumber={() => router.replace("/login")}
        />
      </View>
    </Screen>
  );
}
