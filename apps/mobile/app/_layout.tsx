import { useEffect } from "react";
import { Stack, SplashScreen } from "expo-router";
import { useFonts } from "expo-font";
import {
  useFonts as useSpaceMono,
  SpaceMono_400Regular,
  SpaceMono_400Regular_Italic,
  SpaceMono_700Bold,
} from "@expo-google-fonts/space-mono";
import { DotGothic16_400Regular } from "@expo-google-fonts/dotgothic16";
import { BungeeShade_400Regular } from "@expo-google-fonts/bungee-shade";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
  return <Stack />;
}
