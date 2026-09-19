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
import { PixelifySans_700Bold } from "@expo-google-fonts/pixelify-sans";
import { Jersey25_400Regular } from "@expo-google-fonts/jersey-25";
import { PressStart2P_400Regular } from "@expo-google-fonts/press-start-2p";
import { Handjet_800ExtraBold } from "@expo-google-fonts/handjet";
import { Doto_700Bold } from "@expo-google-fonts/doto";
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
    // Display candidates under review — remove the ones we reject.
    PixelifySans_700Bold,
    Jersey25_400Regular,
    PressStart2P_400Regular,
    Handjet_800ExtraBold,
    Doto_700Bold,
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
        {/* Dialogs paint their own ground, and screens use the Screen
            primitive: the navigation container's default background
            covers anything painted underneath it. */}
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  );
}
