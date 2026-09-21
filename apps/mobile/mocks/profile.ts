import type { Profile } from "@/lib/profile";

/**
 * The signed-in user. Deliberately photo-less: that is the state a new
 * account is in, so the dialog has to answer "what do we show instead".
 *
 * The phone number is the mock auth number, so the dev sign-in and this
 * profile describe the same person.
 */
export const PROFILE: Profile = {
  id: "user-demo",
  displayName: "Ada Lovelace",
  phoneNumber: "+15550000001",
  profilePhotoUrl: null,
  handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
  timezone: "America/New_York",
  temperatureUnit: "fahrenheit",
};
