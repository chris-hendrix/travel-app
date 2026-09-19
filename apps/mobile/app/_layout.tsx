import { useEffect } from "react";
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
  return (
    <>
      {DIALOG_ROUTES.includes(pathname) ? null : <AppHeader />}
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
