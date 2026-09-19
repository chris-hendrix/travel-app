import { useEffect } from "react";
import { View } from "react-native";
import { Stack, SplashScreen, usePathname } from "expo-router";
import { useFonts } from "expo-font";
import {
  useFonts as useSpaceMono,
  SpaceMono_400Regular,
  SpaceMono_400Regular_Italic,
  SpaceMono_700Bold,
} from "@expo-google-fonts/space-mono";
import { DotGothic16_400Regular } from "@expo-google-fonts/dotgothic16";
import { BungeeShade_400Regular } from "@expo-google-fonts/bungee-shade";
import { AppHeader } from "@/components/ui/AppHeader";
import "../global.css";

SplashScreen.preventAutoHideAsync();

// Route-based fullscreen dialogs render their own title-mode header,
// so the global wordmark bar stays off them.
const DIALOG_ROUTES = ["/notifications", "/profile"];

export default function RootLayout() {
  const pathname = usePathname();
  const [displayLoaded] = useFonts({
    DotGothic16_400Regular,
    BungeeShade_400Regular,
  });
  const [monoLoaded] = useSpaceMono({
    SpaceMono_400Regular,
    SpaceMono_400Regular_Italic,
    SpaceMono_700Bold,
  });
  const loaded = displayLoaded && monoLoaded;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  const isDialog = DIALOG_ROUTES.includes(pathname);
  return (
    <View className="flex-1 bg-sand">
      {/* App shell: a fixed-height column so the screen scrolls under the
          header instead of scrolling the whole document (web). */}
      {isDialog ? null : <AppHeader />}
      <View className="flex-1">
        {/* Screens are transparent so the shell's sand ground shows
            through. React Navigation paints #f2f2f2 on the screen
            container by default, which hid the whole palette. */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </View>
    </View>
  );
}
