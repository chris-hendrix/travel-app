import { useEffect } from "react";
import { Stack, SplashScreen } from "expo-router";
import { useFonts as useAnton, Anton_400Regular } from "@expo-google-fonts/anton";
import {
  useFonts as useArchivo,
  Archivo_400Regular,
  Archivo_400Regular_Italic,
  Archivo_700Bold,
} from "@expo-google-fonts/archivo";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [antonLoaded] = useAnton({ Anton_400Regular });
  const [archivoLoaded] = useArchivo({
    Archivo_400Regular,
    Archivo_400Regular_Italic,
    Archivo_700Bold,
  });
  const loaded = antonLoaded && archivoLoaded;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  return <Stack />;
}
