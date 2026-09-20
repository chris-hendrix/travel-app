import { Redirect, useRouter } from "expo-router";
import { View } from "react-native";
import { PhoneStep } from "@/components/auth/PhoneStep";
import { Screen } from "@/components/ui/Screen";
import { useLeaveFlow } from "@/hooks/useLeaveFlow";
import { useAuth } from "@/lib/authStore";

/**
 * The way in: one screen for signing in and for signing up, because they
 * are the same act here. The API decides afterwards whether the number
 * belongs to somebody it already knows, which is what `requiresProfile`
 * carries.
 *
 * The body is PhoneStep, which an invitation opens too. That is the
 * reason it is a component: the consent disclosure is a legal artefact
 * with a registered campaign behind it, and one copy of it is one thing
 * to keep in step.
 */
export default function Login() {
  const router = useRouter();
  const { user } = useAuth();
  const leave = useLeaveFlow();

  // Signed in already, which is what pressing back from the trips list
  // arrives as: a sign-in form is not a thing to show somebody who is in.
  if (user) return <Redirect href="/trips" />;

  return (
    <Screen>
      <View className="pt-4 md:pt-14">
        <PhoneStep
          title="Get started"
          body="Enter your phone number to sign in or create an account. We send a code by text, so there is no password to remember."
          onSent={() => router.push("/verify")}
          onLeave={leave}
        />
      </View>
    </Screen>
  );
}
