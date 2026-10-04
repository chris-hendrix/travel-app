import { StatusBar } from "react-native";

import { useAuth } from "@/lib/authStore";

/**
 * The status bar, told what it is sitting on.
 *
 * It is a component rather than a line in `app/_layout.tsx` for one reason:
 * `barStyle` depends on whether the ink band is drawn, and only the session
 * knows that. `AppHeader` returns `null` while `status === "restoring"`, so
 * during the boot the top inset is the boot cover's sand — and light content
 * (the band's own setting) is white icons on sand, which is the one state where
 * the bar is unreadable. It is also the state every launch passes through.
 *
 * It reads `useAuth()` here rather than taking a prop from the layout because
 * the layout is *outside* the providers: `app/_layout.tsx` renders
 * `QueryClientProvider` and `AuthProvider`, so it cannot call the hook itself.
 * This small node sits inside them, beside the header it is describing.
 *
 * A dialog keeps dark content for its own reason, unchanged: it has no band
 * either, and its ground is gravel.
 */
export function AppStatusBar({ isDialog }: { isDialog: boolean }) {
  const { status } = useAuth();
  const barStyle =
    isDialog || status === "restoring" ? "dark-content" : "light-content";
  return <StatusBar barStyle={barStyle} />;
}
