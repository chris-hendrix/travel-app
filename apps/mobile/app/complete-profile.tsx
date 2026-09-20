import { useEffect } from "react";
import { Redirect, useRouter } from "expo-router";
import { View } from "react-native";
import { NameStep } from "@/components/auth/NameStep";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/lib/authStore";

/**
 * The third screen, for somebody the API has just met. What to call you
 * is NameStep's; what is here is who belongs on it.
 */
export default function CompleteProfile() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  // No session, nothing to complete. And somebody who is already through
  // belongs past this screen, which is what pressing back arrives as.
  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (user?.profileComplete) return <Redirect href="/trips" />;
  if (!user) return <Redirect href="/login" />;

  return (
    <Screen>
      <View className="pt-4 md:pt-14">
        <NameStep
          title="Complete your profile"
          body="Tell the group who you are. You can change it later."
          onSaved={() => router.replace("/trips")}
          // Signing out rather than navigating home: at this point the
          // session exists and the name does not, so the landing would
          // only send them straight back here.
          onLeave={() => {
            signOut();
            router.replace("/");
          }}
        />
      </View>
    </Screen>
  );
}
