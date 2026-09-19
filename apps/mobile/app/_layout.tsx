import { useEffect } from "react";
import { Stack, SplashScreen } from "expo-router";
import { useFonts } from "expo-font";
import {
  useFonts as useArchivo,
  Archivo_400Regular,
  Archivo_400Regular_Italic,
  Archivo_700Bold,
} from "@expo-google-fonts/archivo";
import { RockSalt_400Regular } from "@expo-google-fonts/rock-salt";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [displayLoaded] = useFonts({ RockSalt_400Regular });
  const [archivoLoaded] = useArchivo({
    Archivo_400Regular,
    Archivo_400Regular_Italic,
    Archivo_700Bold,
  });
  const loaded = displayLoaded && archivoLoaded;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  return <Stack />;
}
