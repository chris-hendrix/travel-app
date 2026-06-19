import type { CapacitorConfig } from "@capacitor/cli";

const isLiveReload = process.env.CAPACITOR_LIVE_RELOAD === "true";

const config: CapacitorConfig = {
  appId: "com.journiful.app",
  appName: "Journiful",
  webDir: isLiveReload ? ".capacitor-empty" : "out",
  server: {
    ...(isLiveReload ? { url: "http://10.0.2.2:3000" } : {}),
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ["alert", "sound"],
    },
  },
};

export default config;
