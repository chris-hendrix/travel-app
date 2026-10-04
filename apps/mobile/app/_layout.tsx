import { Suspense, useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queries/client";
import { Stack, SplashScreen, usePathname, useRouter } from "expo-router";
// `expo-router` re-exports a *narrow* `SplashScreen` — `preventAutoHideAsync`
// and `hideAsync`, the two calls its own docs use, and nothing else. The fade
// comes from the package itself, which is where the API reference imports it
// from, and the alias is so a bare `setOptions` cannot be mistaken for one of
// the several other option-setting calls in this file.
import { setOptions as setSplashOptions } from "expo-splash-screen";
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
// The eight faces, one import each, **by path**. The import from
// `@expo-google-fonts/*` is deliberately absent: a package's `index.js`
// `require`s every face it ships, so one named import brings the whole
// weight axis with it — and `@expo-google-fonts/big-shoulders-display` has
// no per-weight directories to import a single weight from, so its nine
// weights all landed in the bundle and five of them are named by no token
// at all. The web export shipped 14 TTFs where `app.json` — which was never
// wrong — lists exactly these eight. `lib/fonts.ts`'s `file` column is what
// these are bound against, by `__tests__/fonts.test.ts` and by
// `scripts/check-export.mjs`; the specifiers here are package-absolute
// because this file lives in `app/`, where `./node_modules/…` would not.
import BungeeShade_400Regular from "@expo-google-fonts/bungee-shade/400Regular/BungeeShade_400Regular.ttf";
import BigShouldersDisplay_900Black from "@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf";
import BigShouldersDisplay_800ExtraBold from "@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_800ExtraBold.ttf";
import BigShouldersDisplay_700Bold from "@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf";
import BigShouldersDisplay_600SemiBold from "@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_600SemiBold.ttf";
import SpaceMono_400Regular from "@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf";
import SpaceMono_700Bold from "@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf";
import SpaceMono_400Regular_Italic from "@expo-google-fonts/space-mono/400Regular_Italic/SpaceMono_400Regular_Italic.ttf";
import { AppHeader } from "@/components/ui/AppHeader";
import { AppStatusBar } from "@/components/ui/AppStatusBar";
import * as SystemNotifications from "expo-notifications";
import type { NotificationResponse } from "expo-notifications";
import { BootGate } from "@/components/ui/BootGate";
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
// The native splash's exit, where the platform allows one: a 200ms fade out.
// `fade` is iOS-only, which is the fact the whole boot cover is built around —
// on Android the splash is replaced by the first JS frame in a single frame, so
// the cover's first frame has to *be* the splash (same asset, same width, same
// sand) rather than something that resembles it. A no-op elsewhere, and `void`,
// so there is nothing here to catch or await.
setSplashOptions({ duration: 200, fade: true });
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
  // Four weights of the display face, not one family with four weights.
  // Android derives the family from the TTF's basename, so
  // `BigShouldersDisplay_900Black` and `BigShouldersDisplay_600SemiBold`
  // are two families and there is no weight axis to ask for: the weight
  // is in the name, which is why `--font-display-black` and friends are
  // four tokens and not one plus a `font-black` (Task 1).
  //
  // The eight above are the only faces in the bundle, keyed by family
  // (the shorthand is the family name, which is also the TTF's basename —
  // Android resolves `font-display-black` by exactly that string).
  const [loaded, fontError] = useFonts({
    BungeeShade_400Regular,
    BigShouldersDisplay_900Black,
    BigShouldersDisplay_800ExtraBold,
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    SpaceMono_400Regular_Italic,
  });
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
              className={isDialog ? "flex-1 bg-gravel" : "flex-1 bg-sand"}
              style={{
                // The band paints the top inset itself, so the status bar
                // sits on ink rather than on a strip of sand the band can
                // never reach: one shape, edge to edge, and the bar's own
                // content goes light to match. A dialog has no band to paint
                // it, so the inset keeps the shell's ground — and the shell's
                // ground is the dialog's own, gravel, the colour the dialog
                // and its action bar are painted in: a status bar on sand
                // above a dialog on gravel is a seam exactly where no seam
                // belongs. The bottom inset takes the same colour, under the
                // action bar. Both halves of that pair are chosen here,
                // because a bar whose content disagrees with its ground is
                // the one state nobody can read.
                paddingTop: isDialog ? insets.top : 0,
                paddingBottom: insets.bottom,
              }}
            >
              <AppStatusBar isDialog={isDialog} />
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
                      <BootGate label="Opening Journiful" />
                    )
                  }
                >
                  {/*
                    A dialog is a sheet, and the stack is what says so.

                    `DIALOG_ROUTES` has been the list of routes that wear
                    their own title-mode header since the shell was written;
                    until now they were `presentation: 'card'` with no
                    `animation`, which on Android is the platform's own
                    horizontal push — the same transition as going deeper
                    into the app. A dialog is not deeper, it is *on top*, and
                    the one option that says so is a modal presentation that
                    slides from the bottom.

                    Both options are needed and neither is enough on its own.
                    `animation: 'slide_from_bottom'` alone would slide the
                    screen up and leave it a card, so the platform gesture
                    would still be a horizontal one. `presentation: 'modal'`
                    alone would leave the animation to the platform, which is
                    `slide_from_bottom` **on iOS only** — expo-router's own
                    `NativeStackView` picks that default inside a
                    `Platform.OS === 'ios'` branch, so on Android it would be
                    unset. Written out, both surfaces do the same thing.

                    Two edges worth knowing, both expo-router's rather than
                    ours. The first screen in the stack is forced to a card,
                    so a cold deep link straight into a dialog — a push tap,
                    an invitation link — slides in from the side instead; the
                    headerless shell is why that branch exists at all and it
                    is not ours to change. And `formSheet` is deliberately not
                    used: on Android it is a Material bottom sheet with
                    rounded corners, a drag handle and elevation, which is a
                    second visual language inside a system whose rules are
                    hard corners and no shadows.

                    The web export animates none of this. `react-native-screens`'
                    web build is `ScreenStack = View` and a `Screen` that is a
                    `View` with `display: none`, so `presentation`,
                    `animation` and `animationDuration` are inert there and the
                    export swaps screens instantly, as it always has.
                  */}
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      title: "Journiful",
                    }}
                  >
                    {DIALOG_ROUTES.map((route) => (
                      <Stack.Screen
                        key={route}
                        name={route.slice(1)}
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                        }}
                      />
                    ))}
                  </Stack>
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
