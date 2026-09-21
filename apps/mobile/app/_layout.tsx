import { Suspense, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queries/client";
import { Stack, SplashScreen, usePathname } from "expo-router";
import { useFonts } from "expo-font";
import {
  useFonts as useSpaceMono,
  SpaceMono_400Regular,
  SpaceMono_400Regular_Italic,
  SpaceMono_700Bold,
} from "@expo-google-fonts/space-mono";
import { BungeeShade_400Regular } from "@expo-google-fonts/bungee-shade";
import { Handjet_800ExtraBold } from "@expo-google-fonts/handjet";
import { AppHeader } from "@/components/ui/AppHeader";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { BARE_HEADER_ROUTES, DIALOG_ROUTES } from "@/lib/routes";
import { AuthProvider } from "@/lib/authStore";
import { NotificationsProvider } from "@/lib/notificationsStore";
import { ProfileProvider } from "@/lib/profileStore";
import { TripSettingsProvider } from "@/lib/tripSettingsStore";
import { TripsProvider } from "@/lib/tripsStore";
import { EventsProvider } from "@/lib/eventsStore";
import { TravelProvider } from "@/lib/travelStore";
import { StaysProvider } from "@/lib/staysStore";
import { DisplayZoneProvider } from "@/lib/displayZone";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  // One client per layout mount; QueryClientProvider holds it steady.
  const [queryClient] = useState(() => makeQueryClient());

  // Refetch stale queries when the app comes back to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);
  const [displayLoaded, displayError] = useFonts({
    BungeeShade_400Regular,
    Handjet_800ExtraBold,
  });
  const [monoLoaded, monoError] = useSpaceMono({
    SpaceMono_400Regular,
    SpaceMono_400Regular_Italic,
    SpaceMono_700Bold,
  });
  const loaded = displayLoaded && monoLoaded;
  const fontError = displayError ?? monoError;

  useEffect(() => {
    if (loaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, fontError]);

  useEffect(() => {
    if (fontError) console.warn("Fonts failed to load, using system fallbacks.", fontError);
  }, [fontError]);

  if (!loaded && !fontError) return null;
  const isDialog = DIALOG_ROUTES.includes(pathname);
  const bare = BARE_HEADER_ROUTES[pathname];
  // The lab runs on mocks under the same provider: it gets its own
  // Suspense fallback so a suspended lab specimen never shows an
  // app screen's copy, and vice versa.
  const isLab = pathname === "/design" || pathname.startsWith("/design/");
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TripsProvider>
      <EventsProvider>
      <TravelProvider>
      <StaysProvider>
      <DisplayZoneProvider>
      <NotificationsProvider>
        <ProfileProvider>
          <TripSettingsProvider>
            <View className="flex-1 bg-sand">
              {/* App shell: a fixed-height column so the screen scrolls
                  under the header instead of scrolling the whole document
                  (web). The landing and the auth flow wear a band with no
                  person chrome on it, since nobody has signed in yet. */}
              {isDialog ? null : <AppHeader variant={bare ?? "app"} />}
              <View className="flex-1">
                {/* Dialogs paint their own ground, and screens use the
                    Screen primitive: the navigation container's default
                    background covers anything painted underneath it. */}
                <Suspense
                  fallback={
                    isLab ? (
                      <LoadingBlock label="Loading the lab." />
                    ) : (
                      // What is arriving here is the app, not a thing in
                      // it: this fallback covers the boot, before any
                      // screen's own read has started.
                      <LoadingBlock label="Opening Journiful" />
                    )
                  }
                >
                  <Stack screenOptions={{ headerShown: false }} />
                </Suspense>
              </View>
            </View>
          </TripSettingsProvider>
        </ProfileProvider>
      </NotificationsProvider>
      </DisplayZoneProvider>
      </StaysProvider>
      </TravelProvider>
      </EventsProvider>
    </TripsProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
}
