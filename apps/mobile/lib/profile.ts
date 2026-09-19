import { updateProfileSchema } from "@journiful/shared/schemas";

export type TemperatureUnit = "celsius" | "fahrenheit";

/**
 * The signed-in user, shaped after the API's `userResponseSchema` so the
 * screen survives the swap from mocks. Photo is nullable because that is
 * the state every new account starts in.
 */
export type Profile = {
  id: string;
  displayName: string;
  /** E.164, straight from the API. Formatting happens at the edge. */
  phoneNumber: string;
  profilePhotoUrl: string | null;
  handles: { venmo?: string; instagram?: string } | null;
  timezone: string | null;
  temperatureUnit: TemperatureUnit;
};

/** What the form edits: flat strings, because inputs are strings. */
export type ProfileDraft = {
  displayName: string;
  venmo: string;
  instagram: string;
  temperatureUnit: TemperatureUnit;
};

export type ProfileErrors = Partial<
  Record<"displayName" | "venmo" | "instagram", string>
>;

/** Up to two letters off a display name, for the no-photo state. */
export function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * A number you can read back to someone. Placeholder: it only knows
 * North American E.164, and anything else passes through untouched
 * rather than being re-punctuated wrongly.
 */
export function formatPhone(phoneNumber: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phoneNumber);
  if (!match) return phoneNumber;
  return `+1 ${match[1]} ${match[2]} ${match[3]}`;
}

export function draftFromProfile(profile: Profile): ProfileDraft {
  return {
    displayName: profile.displayName,
    venmo: profile.handles?.venmo ?? "",
    instagram: profile.handles?.instagram ?? "",
    temperatureUnit: profile.temperatureUnit,
  };
}

/** An empty handle is an absent handle, not an empty string. */
export function applyDraft(profile: Profile, draft: ProfileDraft): Profile {
  const handles: { venmo?: string; instagram?: string } = {};
  if (draft.venmo.trim()) handles.venmo = draft.venmo.trim();
  if (draft.instagram.trim()) handles.instagram = draft.instagram.trim();

  return {
    ...profile,
    displayName: draft.displayName.trim(),
    handles: Object.keys(handles).length > 0 ? handles : null,
    temperatureUnit: draft.temperatureUnit,
  };
}

/**
 * The API's own rules, not a copy of them: `updateProfileSchema` is the
 * schema `PUT /me` validates against, so an error shown here is the
 * error the server would return.
 */
export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const result = updateProfileSchema.safeParse({
    displayName: draft.displayName,
    handles: { venmo: draft.venmo, instagram: draft.instagram },
    temperatureUnit: draft.temperatureUnit,
  });

  if (result.success) return {};

  const errors: ProfileErrors = {};
  for (const issue of result.error.issues) {
    // "handles.venmo" is the venmo field; the bare "handles" refine can
    // only fire for platforms this form never sends.
    const field = issue.path[issue.path.length - 1];
    if (field === "displayName" || field === "venmo" || field === "instagram") {
      errors[field] ??= issue.message;
    }
  }
  return errors;
}
