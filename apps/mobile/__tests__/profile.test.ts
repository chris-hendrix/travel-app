import { describe, expect, it } from "vitest";
import {
  applyDraft,
  draftFromProfile,
  initials,
  validateProfile,
  type Profile,
  type ProfileDraft,
} from "@/lib/profile";

const profile: Profile = {
  id: "u1",
  displayName: "Ada Lovelace",
  phoneNumber: "+15550000001",
  profilePhotoUrl: null,
  handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
  timezone: "America/New_York",
  temperatureUnit: "fahrenheit",
};

const draft: ProfileDraft = draftFromProfile(profile);

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada B. Lovelace")).toBe("AL");
    expect(initials("Jean-Luc Picard")).toBe("JP");
  });

  it("copes with one word, padding, and nothing at all", () => {
    expect(initials("Ada")).toBe("A");
    expect(initials("  ada  ")).toBe("A");
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("draftFromProfile", () => {
  it("flattens handles into strings the form can hold", () => {
    expect(draft).toEqual({
      displayName: "Ada Lovelace",
      venmo: "ada-lovelace",
      instagram: "ada.lovelace",
      temperatureUnit: "fahrenheit",
    });
  });

  it("treats missing handles as empty fields", () => {
    expect(draftFromProfile({ ...profile, handles: null }).venmo).toBe("");
  });
});

describe("applyDraft", () => {
  it("writes the draft back and trims it", () => {
    const saved = applyDraft(profile, {
      ...draft,
      displayName: "  Ada L  ",
      venmo: " ada-l ",
    });

    expect(saved.displayName).toBe("Ada L");
    expect(saved.handles).toEqual({ venmo: "ada-l", instagram: "ada.lovelace" });
    expect(saved.phoneNumber).toBe(profile.phoneNumber);
    expect(saved.id).toBe(profile.id);
  });

  it("drops an emptied handle instead of storing a blank", () => {
    expect(
      applyDraft(profile, { ...draft, venmo: "", instagram: "   " }).handles,
    ).toBeNull();
  });
});

describe("validateProfile", () => {
  it("accepts a good draft", () => {
    expect(validateProfile(draft)).toEqual({});
  });

  it("holds the API's own rules", () => {
    expect(validateProfile({ ...draft, displayName: "Al" }).displayName).toBe(
      "Display name must be at least 3 characters",
    );
    expect(
      validateProfile({ ...draft, displayName: "x".repeat(51) }).displayName,
    ).toBe("Display name must not exceed 50 characters");
    expect(
      validateProfile({ ...draft, instagram: "x".repeat(101) }).instagram,
    ).toBeDefined();
  });

  it("reports one message per field at most", () => {
    const errors = validateProfile({ ...draft, displayName: "" });
    expect(Object.keys(errors)).toEqual(["displayName"]);
  });
});
