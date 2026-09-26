import { Suspense, useEffect, useRef, useState } from "react";
import { AppState, Platform, StatusBar, View } from "react-native";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queries/client";
import { Stack, SplashScreen, usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// The web tab's own label. Expo's shell ships an empty <title>, which
// reads as the URL on a tab strip; the mark beside it says which product,
// this says what to call it. A default import, not a named one:
// `expo-router/head` is `export { Head as default }`, so `{ Head }` is
// undefined and takes the whole tree down with it. It is the root
// layout's rather than a screen's, so it holds everywhere — a screen that
// wants its own title renders a Head of its own and the deepest wins.
import Head from "expo-router/head";
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
import * as SystemNotifications from "expo-notifications";
import type { NotificationResponse } from "expo-notifications";
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
  // The window is edge-to-edge on Android, so the system bars are drawn
  // over the app: without these the header's row (the wordmark, the bell,
  // Sign in) sits under the clock and the battery, and a dialog's title
  // sits on the status bar's edge — measured on the emulator, where the
  // status bar is 24dp and the header's own top padding is 16dp. The
  // padding goes on this one view because every route passes through it:
  // header, screens and dialogs alike. The sand ground paints behind the
  // bars, so what shows above the header reads as the app's own ground
  // rather than as a gap. Insets are 0 on web, so the export is unmoved.
  const insets = useSafeAreaInsets();
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
  // `settled` rather than `loaded`: a font that failed is a font that will
  // never arrive, and the splash has to stop waiting for it. The faces
  // themselves are embedded natively (`expo-font`'s config plugin lists them
  // in app.json), so this is the web export's copy and a native no-op: on
  // Android the files are in `assets/fonts/<family>.ttf` from install time,
  // which is what lets the *measure* path resolve them and not just the
  // paint path. Loading them at runtime here left every text measured in the
  // system fallback and painted in ours — the band's wordmark came out as
  // "JOUR", because it was measured as Roboto (222px) and drawn as Bungee
  // Shade (390px).
  const fontsSettled = loaded || Boolean(fontError);

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

  useEffect(() => {
    if (fontError) console.warn("Fonts failed to load, using system fallbacks.", fontError);
  }, [fontError]);

  const isLab = pathname === "/design" || pathname.startsWith("/design/");
  const bare = BARE_HEADER_ROUTES[pathname];
  usePushRouting();
  usePushRegistration();

  // The splash still waits for fonts on native (hideAsync fires only
  // on loaded || fontError above), but the tree renders regardless:
  // in the web prerender fonts never resolve, and gating on them
  // emitted an empty shell for every route behind the layout.
  const isDialog = DIALOG_ROUTES.includes(pathname);
  // The lab runs on mocks under the same provider: it gets its own
  // Suspense fallback so a suspended lab specimen never shows an
  // app screen's copy, and vice versa.
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
            <Head>
              <title>Journiful</title>
            </Head>
            <View
              className="flex-1 bg-sand"
              style={{
                // The band paints the top inset itself, so the status bar
                // sits on ink rather than on a strip of sand the band can
                // never reach: one shape, edge to edge, and the bar's own
                // content goes light to match. A dialog has no band to
                // paint it, so the sand ground keeps the inset there and
                // the bar's content goes dark instead. Both halves of that
                // pair are chosen below, because a bar whose content
                // disagrees with its ground is the one state nobody can
                // read.
                paddingTop: isDialog ? insets.top : 0,
                paddingBottom: insets.bottom,
              }}
            >
              <StatusBar
                barStyle={isDialog ? "dark-content" : "light-content"}
              />
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
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      title: "Journiful",
                    }}
                  />
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

/**
 * Push tap routing: the API's FCM payload carries `data.url` (a web
 * url); `pushTarget` maps it onto an app route. Cold starts resolve
 * through `getLastNotificationResponseAsync` once; warm taps through
 * the response listener. One tap routes once (deduped by notification
 * id). Signed-out taps land on login rather than a screen that 401s.
 */
function usePushRouting() {
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: { remove(): void } | undefined;
    (async () => {
      try {
        const { pushTarget } = await import("@/lib/pushRoutes");
        const { getToken } = await import("@/lib/session");
        const route = async (url: string | undefined, id: string) => {
          if (seen.current.has(id)) return;
          seen.current.add(id);
          const target = pushTarget(url);
          if (!target) return;
          const session = await getToken().catch(() => null);
          router.push(session ? (target as never) : ("/login" as never));
        };
        SystemNotifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        const last = await SystemNotifications.getLastNotificationResponseAsync().catch(() => null);
        const lastUrl = last?.notification.request.content.data?.url;
        if (last && typeof lastUrl === "string") {
          await route(lastUrl, last.notification.request.identifier);
        }
        sub = SystemNotifications.addNotificationResponseReceivedListener((response: NotificationResponse) => {
          const responseUrl = response.notification.request.content.data?.url;
          if (typeof responseUrl === "string") {
            void route(responseUrl, response.notification.request.identifier);
          }
        });
      } catch {
        // Push is best-effort; a missing native module never breaks boot.
      }
    })();
    return () => sub?.remove();
  }, [router]);
}

/**
 * Best-effort re-registration on every launch where permission is
 * already granted. Covers token rotation without touching sign-in.
 */
function usePushRegistration() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const [{ permissionState, registerForPush }, { getToken }] = await Promise.all([
          import("@/lib/push"),
          import("@/lib/session"),
        ]);
        const [permission, session] = await Promise.all([
          permissionState(),
          getToken().catch(() => null),
        ]);
        if (permission === "granted" && session) await registerForPush();
      } catch {
        // Never blocks boot.
      }
    })();
  }, []);
}
